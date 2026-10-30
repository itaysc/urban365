-- An enquiry about a private seller's listing has no agency to belong to, and an
-- enquiry nobody receives is worse than no enquiry form.
ALTER TABLE "Lead"
  ALTER COLUMN "agencyId" DROP NOT NULL,
  ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_one_recipient"
  CHECK (("agencyId" IS NOT NULL) <> ("ownerUserId" IS NOT NULL));

CREATE INDEX "Lead_ownerUserId_idx" ON "Lead" ("ownerUserId");
