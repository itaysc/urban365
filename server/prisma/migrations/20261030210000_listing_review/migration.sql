-- What an automated read of a listing concluded about it.
--
-- Only private sellers are checked: an agency has a licence and a claim that an admin
-- approved, while a stranger with an email address has neither. Everything that exists
-- today — scraped, or written by an agency — is `unchecked`, which is not a verdict and
-- hides nothing.
CREATE TYPE "ListingReviewStatus" AS ENUM ('unchecked', 'clean', 'flagged');

ALTER TABLE "Listing"
  ADD COLUMN "reviewStatus" "ListingReviewStatus" NOT NULL DEFAULT 'unchecked',
  ADD COLUMN "reviewReason" TEXT,
  ADD COLUMN "reviewConfidence" INTEGER,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- The queue a person works through is "flagged, newest first", and that is the only
-- query this column is ever filtered by on its own.
CREATE INDEX "Listing_reviewStatus_idx" ON "Listing" ("reviewStatus", "reviewedAt" DESC)
  WHERE "reviewStatus" = 'flagged';
