-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'removed';

-- CreateEnum
CREATE TYPE "ListingRemovalReason" AS ENUM ('sold', 'rented', 'regret', 'other');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "removedAt" TIMESTAMP(3),
ADD COLUMN "removalReason" "ListingRemovalReason";
