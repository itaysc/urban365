-- CreateEnum
CREATE TYPE "MarketDealSource" AS ENUM ('mashkof', 'taxAuthority');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "gush" INTEGER,
ADD COLUMN     "chelka" INTEGER,
ADD COLUMN     "cadastreAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MarketDeal" (
    "id" TEXT NOT NULL,
    "source" "MarketDealSource" NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAsOf" TIMESTAMP(3),
    "settlementCode" INTEGER NOT NULL,
    "settlement" TEXT NOT NULL,
    "gush" INTEGER NOT NULL,
    "chelka" INTEGER NOT NULL,
    "subChelka" INTEGER,
    "dealDate" TIMESTAMP(3) NOT NULL,
    "dealAmount" BIGINT NOT NULL,
    "rooms" DOUBLE PRECISION,
    "area" INTEGER,
    "pricePerSqm" INTEGER,
    "yearBuilt" INTEGER,
    "propertyGroup" TEXT,
    "dealNature" TEXT,
    "isFullDeal" BOOLEAN NOT NULL DEFAULT true,
    "inStats" BOOLEAN NOT NULL DEFAULT true,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "firstSeen" TIMESTAMP(3),

    CONSTRAINT "MarketDeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketDeal_gush_chelka_idx" ON "MarketDeal"("gush", "chelka");

-- CreateIndex
CREATE INDEX "MarketDeal_settlementCode_dealDate_idx" ON "MarketDeal"("settlementCode", "dealDate");

-- CreateIndex
CREATE INDEX "MarketDeal_source_firstSeen_idx" ON "MarketDeal"("source", "firstSeen");

-- CreateIndex
CREATE INDEX "Listing_gush_chelka_idx" ON "Listing"("gush", "chelka");
