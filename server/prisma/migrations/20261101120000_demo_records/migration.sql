-- One row per record the demo seed created, so clearing it can be exact.
--
-- The alternative — delete everything belonging to the agency, or everything whose name
-- looks made up — is how somebody loses real work to a button marked "clear test data".
-- Nothing is guessed: the seed writes a row here for everything it creates, and the
-- clear deletes those ids and nothing else.
CREATE TABLE "DemoRecord" (
  "id"        TEXT NOT NULL,
  "agencyId"  TEXT NOT NULL,
  "model"     TEXT NOT NULL,
  "recordId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DemoRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemoRecord_agencyId_model_idx" ON "DemoRecord"("agencyId", "model");

-- One record is seeded once. Without this a seed run twice could register the same id
-- twice and the clear would try to delete it twice.
CREATE UNIQUE INDEX "DemoRecord_model_recordId_key" ON "DemoRecord"("model", "recordId");

ALTER TABLE "DemoRecord"
  ADD CONSTRAINT "DemoRecord_agencyId_fkey" FOREIGN KEY ("agencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant-only, the same four policies every agency-owned table gets.
ALTER TABLE "DemoRecord" ENABLE ROW LEVEL SECURITY;

CREATE POLICY demo_record_tenant_read ON "DemoRecord"
  FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY demo_record_tenant_insert ON "DemoRecord"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY demo_record_tenant_update ON "DemoRecord"
  FOR UPDATE USING ("agencyId" = app_agency_id() OR app_is_platform_admin())
           WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY demo_record_tenant_delete ON "DemoRecord"
  FOR DELETE USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
