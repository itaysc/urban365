-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "lastPriceDropAmount" INTEGER,
ADD COLUMN     "lastPriceDropAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ListingPriceChange" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "previous" INTEGER,
    "price" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingPriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingPriceChange_listingId_changedAt_idx" ON "ListingPriceChange"("listingId", "changedAt");

-- AddForeignKey
ALTER TABLE "ListingPriceChange" ADD CONSTRAINT "ListingPriceChange_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
