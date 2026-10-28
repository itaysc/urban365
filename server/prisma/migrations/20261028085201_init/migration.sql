-- CreateEnum
CREATE TYPE "Section" AS ENUM ('forsale', 'rent', 'commercial');

-- CreateEnum
CREATE TYPE "ListingSource" AS ENUM ('yad2', 'import', 'manual');

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "yad2Id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "phone" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "openingHours" JSONB,
    "assetsForSaleCount" INTEGER,
    "assetsForRentCount" INTEGER,
    "commercialAssetsCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "yad2Id" TEXT,
    "name" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "activeAssetsCount" INTEGER,
    "specialization" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "source" "ListingSource" NOT NULL DEFAULT 'yad2',
    "section" "Section" NOT NULL,
    "agencyId" TEXT NOT NULL,
    "adNumber" BIGINT,
    "listingUrl" TEXT,
    "price" INTEGER,
    "priceBeforeDrop" INTEGER,
    "pricePerSquareMeter" INTEGER,
    "propertyType" TEXT,
    "propertyGroup" TEXT,
    "propertyCondition" TEXT,
    "rooms" DOUBLE PRECISION,
    "floor" INTEGER,
    "buildingTopFloor" INTEGER,
    "squareMeter" INTEGER,
    "squareMeterBuilt" INTEGER,
    "squareMeterGarden" INTEGER,
    "balconiesCount" INTEGER,
    "parkingSpacesCount" INTEGER,
    "city" TEXT,
    "neighborhood" TEXT,
    "street" TEXT,
    "houseNumber" INTEGER,
    "region" TEXT,
    "area" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "amenities" TEXT[],
    "tags" TEXT[],
    "description" TEXT,
    "coverImageUrl" TEXT,
    "imageUrls" TEXT[],
    "imagesCount" INTEGER NOT NULL DEFAULT 0,
    "contactName" TEXT,
    "brokerName" TEXT,
    "brokerLicenseNumber" TEXT,
    "hasFullDetails" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "listedAt" TIMESTAMP(3),
    "updatedAtSource" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delistedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "section" "Section" NOT NULL,
    "cardsFound" INTEGER NOT NULL,
    "listingsUpserted" INTEGER NOT NULL,
    "detailsMissing" INTEGER NOT NULL,
    "failedTokens" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agency_yad2Id_key" ON "Agency"("yad2Id");

-- CreateIndex
CREATE INDEX "Agency_name_idx" ON "Agency"("name");

-- CreateIndex
CREATE INDEX "Broker_agencyId_idx" ON "Broker"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Broker_agencyId_yad2Id_key" ON "Broker"("agencyId", "yad2Id");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_token_key" ON "Listing"("token");

-- CreateIndex
CREATE INDEX "Listing_agencyId_section_idx" ON "Listing"("agencyId", "section");

-- CreateIndex
CREATE INDEX "Listing_city_price_idx" ON "Listing"("city", "price");

-- CreateIndex
CREATE INDEX "Listing_section_price_idx" ON "Listing"("section", "price");

-- CreateIndex
CREATE INDEX "Listing_rooms_idx" ON "Listing"("rooms");

-- CreateIndex
CREATE INDEX "Listing_delistedAt_idx" ON "Listing"("delistedAt");

-- CreateIndex
CREATE INDEX "Listing_amenities_idx" ON "Listing" USING GIN ("amenities");

-- CreateIndex
CREATE INDEX "ScrapeRun_agencyId_section_startedAt_idx" ON "ScrapeRun"("agencyId", "section", "startedAt");

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeRun" ADD CONSTRAINT "ScrapeRun_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
