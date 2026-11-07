-- Credits an agency spends to publish a listing it typed into the app.
-- One listing is 25 ILS; packs of 10, 50 and 100 are 20, 17 and 15 ILS each.
-- The flag that turns charging on lives in the app, not here: with it off these
-- rows are never written and the balance is never read.

ALTER TABLE "Agency" ADD COLUMN "listingCredits" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Listing" ADD COLUMN "creditChargedAt" TIMESTAMP(3);

CREATE TABLE "ListingPackageOrder" (
  "id"            TEXT NOT NULL,
  "agencyId"      TEXT NOT NULL,
  "size"          INTEGER NOT NULL,
  "unitAgorot"    INTEGER NOT NULL,
  "totalAgorot"   INTEGER NOT NULL,
  "purchasedById" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ListingPackageOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingPackageOrder_agencyId_createdAt_idx"
  ON "ListingPackageOrder"("agencyId", "createdAt");

ALTER TABLE "ListingPackageOrder"
  ADD CONSTRAINT "ListingPackageOrder_agencyId_fkey" FOREIGN KEY ("agencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ListingPackageOrder_purchasedById_fkey" FOREIGN KEY ("purchasedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An order is a receipt: the agency can read and add its own, and nothing else.
ALTER TABLE "ListingPackageOrder" ENABLE ROW LEVEL SECURITY;

CREATE POLICY listingpackageorder_tenant_read ON "ListingPackageOrder"
  FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin());

CREATE POLICY listingpackageorder_tenant_insert ON "ListingPackageOrder"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
