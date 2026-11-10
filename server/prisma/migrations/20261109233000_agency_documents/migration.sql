-- Files an office keeps for itself: contracts, payslips, scans.
-- Both CRM verticals use the same table. The bytes are in the private bucket;
-- this row is the list, and the download route is how they leave.

CREATE TABLE "AgencyDocument" (
  "id"           TEXT NOT NULL,
  "agencyId"     TEXT NOT NULL,
  "uploadedById" TEXT,
  "fileName"     TEXT NOT NULL,
  "contentType"  TEXT NOT NULL,
  "byteSize"     INTEGER NOT NULL,
  "storageKey"   TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgencyDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgencyDocument_storageKey_key" ON "AgencyDocument"("storageKey");
CREATE INDEX "AgencyDocument_agencyId_createdAt_idx" ON "AgencyDocument"("agencyId", "createdAt");

ALTER TABLE "AgencyDocument"
  ADD CONSTRAINT "AgencyDocument_agencyId_fkey" FOREIGN KEY ("agencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AgencyDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant-only, the same four policies every agency-owned table gets. No FORCE: the
-- owner role has to be able to cross agencies, which is what `20261028170000` is about.
-- No public read: a client's payslip is not a listing photo.
ALTER TABLE "AgencyDocument" ENABLE ROW LEVEL SECURITY;

CREATE POLICY agencydocument_tenant_read ON "AgencyDocument"
  FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY agencydocument_tenant_insert ON "AgencyDocument"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY agencydocument_tenant_update ON "AgencyDocument"
  FOR UPDATE USING ("agencyId" = app_agency_id() OR app_is_platform_admin())
           WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY agencydocument_tenant_delete ON "AgencyDocument"
  FOR DELETE USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
