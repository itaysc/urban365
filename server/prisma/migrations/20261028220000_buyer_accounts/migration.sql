-- Consumer accounts.
--
-- Identity stays in "User": one login, one session family, one password-reset flow and
-- one OAuth callback, rather than a parallel stack to keep in security-sync. A buyer is
-- simply a User with no AgencyMembership. What is genuinely new — preferences and saved
-- listings — lives in its own tables.

CREATE TYPE "AuthProvider" AS ENUM ('google');

ALTER TABLE "User" ADD COLUMN "authProvider" "AuthProvider";
ALTER TABLE "User" ADD COLUMN "authProviderId" TEXT;

-- One account per provider subject. Partial, because every password account has NULLs
-- here and Postgres would otherwise treat them as distinct anyway — stating it keeps
-- the intent legible.
CREATE UNIQUE INDEX "User_authProvider_authProviderId_key"
  ON "User" ("authProvider", "authProviderId")
  WHERE "authProvider" IS NOT NULL;

CREATE TABLE "BuyerProfile" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "searchNotes"        TEXT,
  "notifyOnPriceDrop"  BOOLEAN NOT NULL DEFAULT true,
  "notifyOnNewMatches" BOOLEAN NOT NULL DEFAULT true,
  "weeklyDigest"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyerProfile_userId_key" ON "BuyerProfile" ("userId");

ALTER TABLE "BuyerProfile"
  ADD CONSTRAINT "BuyerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SavedListing" (
  "id"        TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedListing_profileId_listingId_key" ON "SavedListing" ("profileId", "listingId");
CREATE INDEX "SavedListing_profileId_createdAt_idx" ON "SavedListing" ("profileId", "createdAt");

ALTER TABLE "SavedListing"
  ADD CONSTRAINT "SavedListing_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "BuyerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedListing"
  ADD CONSTRAINT "SavedListing_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security. Both tables belong to a *person*, not an agency, so the tenant
-- policies used elsewhere do not apply: `app.current_user_id` is what scopes them, and
-- the tenant interceptor already sets it on every authenticated request.
ALTER TABLE "BuyerProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedListing" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.current_user_id', true), '') $$;

CREATE POLICY buyerprofile_own ON "BuyerProfile"
  USING      ("userId" = app_user_id())
  WITH CHECK ("userId" = app_user_id());

CREATE POLICY savedlisting_own ON "SavedListing"
  USING (
    EXISTS (SELECT 1 FROM "BuyerProfile" p WHERE p.id = "profileId" AND p."userId" = app_user_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "BuyerProfile" p WHERE p.id = "profileId" AND p."userId" = app_user_id())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "BuyerProfile" TO nadlan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SavedListing" TO nadlan_app;
