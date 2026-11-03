-- AlterTable
ALTER TABLE "MarketDeal" ADD COLUMN     "cellLat" INTEGER,
ADD COLUMN     "cellLng" INTEGER;

-- CreateIndex
CREATE INDEX "MarketDeal_cellLat_cellLng_dealDate_idx" ON "MarketDeal"("cellLat", "cellLng", "dealDate");
