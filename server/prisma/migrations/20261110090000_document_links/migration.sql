-- An office file attached to a customer, listing, deal, mortgage case or lead.
-- The file stays in AgencyDocument. Deleting the record drops the attachment.

CREATE TABLE "AgencyDocumentLink" (
  "id"             TEXT NOT NULL,
  "agencyId"       TEXT NOT NULL,
  "documentId"     TEXT NOT NULL,
  "customerId"     TEXT,
  "listingId"      TEXT,
  "dealId"         TEXT,
  "mortgageCaseId" TEXT,
  "leadId"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgencyDocumentLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgencyDocumentLink_documentId_customerId_key"
  ON "AgencyDocumentLink"("documentId", "customerId");
CREATE UNIQUE INDEX "AgencyDocumentLink_documentId_listingId_key"
  ON "AgencyDocumentLink"("documentId", "listingId");
CREATE UNIQUE INDEX "AgencyDocumentLink_documentId_dealId_key"
  ON "AgencyDocumentLink"("documentId", "dealId");
CREATE UNIQUE INDEX "AgencyDocumentLink_documentId_mortgageCaseId_key"
  ON "AgencyDocumentLink"("documentId", "mortgageCaseId");
CREATE UNIQUE INDEX "AgencyDocumentLink_documentId_leadId_key"
  ON "AgencyDocumentLink"("documentId", "leadId");

CREATE INDEX "AgencyDocumentLink_agencyId_idx" ON "AgencyDocumentLink"("agencyId");
CREATE INDEX "AgencyDocumentLink_customerId_idx" ON "AgencyDocumentLink"("customerId");
CREATE INDEX "AgencyDocumentLink_listingId_idx" ON "AgencyDocumentLink"("listingId");
CREATE INDEX "AgencyDocumentLink_dealId_idx" ON "AgencyDocumentLink"("dealId");
CREATE INDEX "AgencyDocumentLink_mortgageCaseId_idx" ON "AgencyDocumentLink"("mortgageCaseId");
CREATE INDEX "AgencyDocumentLink_leadId_idx" ON "AgencyDocumentLink"("leadId");

ALTER TABLE "AgencyDocumentLink"
  ADD CONSTRAINT "AgencyDocumentLink_agencyId_fkey" FOREIGN KEY ("agencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AgencyDocumentLink_documentId_fkey" FOREIGN KEY ("documentId")
    REFERENCES "AgencyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AgencyDocumentLink_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AgencyDocumentLink_listingId_fkey" FOREIGN KEY ("listingId")
    REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AgencyDocumentLink_dealId_fkey" FOREIGN KEY ("dealId")
    REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AgencyDocumentLink_mortgageCaseId_fkey" FOREIGN KEY ("mortgageCaseId")
    REFERENCES "MortgageCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AgencyDocumentLink_leadId_fkey" FOREIGN KEY ("leadId")
    REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one subject. A row that points at nothing, or at two records, is not a link.
ALTER TABLE "AgencyDocumentLink"
  ADD CONSTRAINT "AgencyDocumentLink_one_subject_check"
  CHECK (
    (CASE WHEN "customerId" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "listingId" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "dealId" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "mortgageCaseId" IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN "leadId" IS NOT NULL THEN 1 ELSE 0 END)
    = 1
  );

-- Tenant-only, the same four policies every agency-owned table gets. No FORCE: the
-- owner role has to be able to cross agencies, which is what `20261028170000` is about.
ALTER TABLE "AgencyDocumentLink" ENABLE ROW LEVEL SECURITY;

CREATE POLICY agencydocumentlink_tenant_read ON "AgencyDocumentLink"
  FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY agencydocumentlink_tenant_insert ON "AgencyDocumentLink"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY agencydocumentlink_tenant_update ON "AgencyDocumentLink"
  FOR UPDATE USING ("agencyId" = app_agency_id() OR app_is_platform_admin())
           WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY agencydocumentlink_tenant_delete ON "AgencyDocumentLink"
  FOR DELETE USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
