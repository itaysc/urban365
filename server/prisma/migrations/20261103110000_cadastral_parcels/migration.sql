-- CreateTable
CREATE TABLE "Parcel" (
    "gush" INTEGER NOT NULL,
    "chelka" INTEGER NOT NULL,
    "minLat" DOUBLE PRECISION NOT NULL,
    "maxLat" DOUBLE PRECISION NOT NULL,
    "minLng" DOUBLE PRECISION NOT NULL,
    "maxLng" DOUBLE PRECISION NOT NULL,
    "cellLat" INTEGER NOT NULL,
    "cellLng" INTEGER NOT NULL,
    "geometry" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("gush","chelka")
);

-- CreateIndex
CREATE INDEX "Parcel_cellLat_cellLng_idx" ON "Parcel"("cellLat", "cellLng");
