-- Offices an agency works out of, drawn on the public map.
CREATE TABLE "AgencyOffice" (
  "id"          TEXT NOT NULL,
  "agencyId"    TEXT NOT NULL,
  "label"       TEXT,
  "city"        TEXT NOT NULL,
  "street"      TEXT,
  "houseNumber" INTEGER,
  "latitude"    DOUBLE PRECISION,
  "longitude"   DOUBLE PRECISION,
  "phone"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgencyOffice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgencyOffice_agencyId_idx" ON "AgencyOffice" ("agencyId");

ALTER TABLE "AgencyOffice"
  ADD CONSTRAINT "AgencyOffice_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Shaped like Broker: anyone may read one, only its own agency may write it. An office
-- is public information — it is an address on a map with a sign over the door — and the
-- map that draws it is served to visitors with no agency in context at all.
--
-- No FORCE: the owner role runs the scraper and the admin paths, and forcing policies
-- onto the table owner locked those out once already.
ALTER TABLE "AgencyOffice" ENABLE ROW LEVEL SECURITY;

CREATE POLICY agencyoffice_public_read ON "AgencyOffice" FOR SELECT USING (true);

CREATE POLICY agencyoffice_tenant_insert ON "AgencyOffice"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());

CREATE POLICY agencyoffice_tenant_update ON "AgencyOffice"
  FOR UPDATE USING      ("agencyId" = app_agency_id() OR app_is_platform_admin())
             WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());

CREATE POLICY agencyoffice_tenant_delete ON "AgencyOffice"
  FOR DELETE USING      ("agencyId" = app_agency_id() OR app_is_platform_admin());
