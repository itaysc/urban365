-- The secret behind an office's private preview page.
ALTER TABLE "Agency" ADD COLUMN "previewToken" TEXT;
CREATE UNIQUE INDEX "Agency_previewToken_key" ON "Agency"("previewToken");

-- Listings imported for an office nobody there has claimed are not theirs to publish
-- yet. They go back to drafts until the office is approved, which publishes them again.
UPDATE "Listing" AS l
SET "status" = 'draft'
FROM "Agency" AS a
WHERE l."agencyId" = a."id"
  AND a."status" IN ('unclaimed', 'pending')
  AND l."source" = 'yad2'
  AND l."status" = 'published';
