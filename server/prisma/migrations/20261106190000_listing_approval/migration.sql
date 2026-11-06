-- CreateEnum
CREATE TYPE "ListingApproval" AS ENUM ('none', 'pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "approval" "ListingApproval" NOT NULL DEFAULT 'none',
ADD COLUMN "rejectionNote" TEXT,
ADD COLUMN "decidedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Listing_approval_idx" ON "Listing"("approval");
