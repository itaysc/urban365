-- Saving a listing before making an account.

CREATE TABLE "Visitor" (
  "id"                  TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "mergedIntoProfileId" TEXT,

  CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Visitor_lastSeenAt_idx" ON "Visitor" ("lastSeenAt");

-- A save now belongs to a profile OR a visitor.
ALTER TABLE "SavedListing" ALTER COLUMN "profileId" DROP NOT NULL;
ALTER TABLE "SavedListing" ADD COLUMN "visitorId" TEXT;

ALTER TABLE "SavedListing"
  ADD CONSTRAINT "SavedListing_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "Visitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one owner. Without this a row could belong to both or to neither, and every
-- query that assumes one of them would be wrong in a way nothing would report.
ALTER TABLE "SavedListing"
  ADD CONSTRAINT "SavedListing_one_owner"
  CHECK (("profileId" IS NOT NULL) <> ("visitorId" IS NOT NULL));

-- Partial, because Postgres counts NULLs as distinct: a plain UNIQUE over a nullable
-- column would let the same visitor save the same listing again and again.
DROP INDEX IF EXISTS "SavedListing_profileId_listingId_key";
CREATE UNIQUE INDEX "SavedListing_profile_listing_key"
  ON "SavedListing" ("profileId", "listingId") WHERE "profileId" IS NOT NULL;
CREATE UNIQUE INDEX "SavedListing_visitor_listing_key"
  ON "SavedListing" ("visitorId", "listingId") WHERE "visitorId" IS NOT NULL;

CREATE INDEX "SavedListing_visitorId_createdAt_idx" ON "SavedListing" ("visitorId", "createdAt");
CREATE INDEX "SavedListing_listingId_idx" ON "SavedListing" ("listingId");

-- The count shown on every card.
ALTER TABLE "Listing" ADD COLUMN "savedCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Listing" l
SET "savedCount" = (SELECT count(*) FROM "SavedListing" s WHERE s."listingId" = l.id);

-- Visible to everyone, writable only by its owner. A visitor has no tenant context at
-- all, so the application is what scopes these; RLS here would refuse the anonymous
-- path entirely.
ALTER TABLE "Visitor" ENABLE ROW LEVEL SECURITY;
CREATE POLICY visitor_all ON "Visitor" USING (true) WITH CHECK (true);
