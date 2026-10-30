-- People an agency keeps, as opposed to enquiries it received.
--
-- Separate from `Lead` on purpose: a lead is an event, a customer is a relationship.
-- The brief — what they are looking for — is stored in the same shape the public search
-- takes its filters, so "what has come in for this customer" is the ordinary search
-- rather than a second thing to keep in step with it.
CREATE TYPE "CustomerKind" AS ENUM ('buyer', 'seller', 'both');

CREATE TABLE "Customer" (
  "id"             TEXT NOT NULL,
  "agencyId"       TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "phone"          TEXT,
  "email"          TEXT,
  "kind"           "CustomerKind" NOT NULL DEFAULT 'buyer',
  "notes"          TEXT,
  "lookingSection" "Section",
  "lookingCities"  TEXT[] DEFAULT ARRAY[]::TEXT[],
  "lookingTypes"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  "minRooms"       DOUBLE PRECISION,
  "maxRooms"       DOUBLE PRECISION,
  "minPrice"       INTEGER,
  "maxPrice"       INTEGER,
  "minSquareMeter" INTEGER,
  "assignedToId"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Customer_agencyId_createdAt_idx" ON "Customer" ("agencyId", "createdAt");
CREATE INDEX "Customer_assignedToId_idx" ON "Customer" ("assignedToId");

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_agencyId_fkey" FOREIGN KEY ("agencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Customer_assignedToId_fkey" FOREIGN KEY ("assignedToId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant-only, the same four policies every agency-owned table gets. No FORCE: the
-- owner role has to be able to cross agencies, which is what `20261028170000` is about.
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_tenant_read ON "Customer"
  FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY customer_tenant_insert ON "Customer"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY customer_tenant_update ON "Customer"
  FOR UPDATE USING ("agencyId" = app_agency_id() OR app_is_platform_admin())
           WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY customer_tenant_delete ON "Customer"
  FOR DELETE USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
