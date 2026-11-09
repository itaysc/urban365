-- A second CRM vertical: mortgage brokers, alongside real-estate agencies.
--
-- `Agency.vertical` says which; everything an agency already had (Lead, Customer,
-- Deal, calendar) stays shared. What a mortgage brokerage needs that a real-estate
-- agency has no use for is new: a case per mortgage file, the competing bank offers
-- logged against it, and a directory of banker contacts. See the comments on the
-- models themselves in schema.prisma for why each is shaped the way it is.

CREATE TYPE "AgencyVertical" AS ENUM ('real_estate', 'mortgage_broker');

ALTER TABLE "Agency" ADD COLUMN "vertical" "AgencyVertical" NOT NULL DEFAULT 'real_estate';

CREATE TYPE "MortgageCaseStage" AS ENUM (
  'new_request', 'consultation', 'documents', 'sent_to_banks',
  'approved_in_principle', 'signed', 'lost'
);

CREATE TABLE "MortgageCase" (
  "id"                     TEXT NOT NULL,
  "agencyId"               TEXT NOT NULL,
  "leadId"                 TEXT,
  "customerId"             TEXT,
  "dealId"                 TEXT,
  "stage"                  "MortgageCaseStage" NOT NULL DEFAULT 'new_request',
  "assignedToId"           TEXT,
  "requestedAmount"        INTEGER,
  "propertyValue"          INTEGER,
  "equityAvailable"        INTEGER,
  "monthlyIncomePrimary"   INTEGER,
  "monthlyIncomeSecondary" INTEGER,
  "employmentType"         TEXT,
  "propertyCity"           TEXT,
  "loanTermYears"          INTEGER,
  "riskPreference"         TEXT,
  "notes"                  TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MortgageCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MortgageCase_dealId_key" ON "MortgageCase"("dealId");
CREATE INDEX "MortgageCase_agencyId_stage_createdAt_idx" ON "MortgageCase"("agencyId", "stage", "createdAt");
CREATE INDEX "MortgageCase_leadId_idx" ON "MortgageCase"("leadId");
CREATE INDEX "MortgageCase_customerId_idx" ON "MortgageCase"("customerId");
CREATE INDEX "MortgageCase_assignedToId_idx" ON "MortgageCase"("assignedToId");

ALTER TABLE "MortgageCase"
  ADD CONSTRAINT "MortgageCase_agencyId_fkey" FOREIGN KEY ("agencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MortgageCase_leadId_fkey" FOREIGN KEY ("leadId")
    REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "MortgageCase_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "MortgageCase_dealId_fkey" FOREIGN KEY ("dealId")
    REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "MortgageCase_assignedToId_fkey" FOREIGN KEY ("assignedToId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BankOffer" (
  "id"             TEXT NOT NULL,
  "caseId"         TEXT NOT NULL,
  "bankName"       TEXT NOT NULL,
  "track"          TEXT,
  "interestRate"   DOUBLE PRECISION,
  "monthlyPayment" INTEGER,
  "totalRepayment" INTEGER,
  "receivedAt"     TIMESTAMP(3),
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BankOffer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BankOffer_caseId_idx" ON "BankOffer"("caseId");

ALTER TABLE "BankOffer"
  ADD CONSTRAINT "BankOffer_caseId_fkey" FOREIGN KEY ("caseId")
    REFERENCES "MortgageCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BankerContact" (
  "id"        TEXT NOT NULL,
  "agencyId"  TEXT NOT NULL,
  "bankName"  TEXT NOT NULL,
  "branch"    TEXT,
  "name"      TEXT NOT NULL,
  "phone"     TEXT,
  "email"     TEXT,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BankerContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BankerContact_agencyId_idx" ON "BankerContact"("agencyId");

ALTER TABLE "BankerContact"
  ADD CONSTRAINT "BankerContact_agencyId_fkey" FOREIGN KEY ("agencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── row-level security ───────────────────────────────────────────────────────────
-- MortgageCase and BankerContact carry `agencyId` directly, so they get the same four
-- tenant policies `Customer` has (no FORCE — the owner role still needs to cross
-- agencies, per `20261028170000_rls_no_force_on_owner`).

ALTER TABLE "MortgageCase" ENABLE ROW LEVEL SECURITY;

CREATE POLICY mortgagecase_tenant_read ON "MortgageCase"
  FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY mortgagecase_tenant_insert ON "MortgageCase"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY mortgagecase_tenant_update ON "MortgageCase"
  FOR UPDATE USING ("agencyId" = app_agency_id() OR app_is_platform_admin())
           WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY mortgagecase_tenant_delete ON "MortgageCase"
  FOR DELETE USING ("agencyId" = app_agency_id() OR app_is_platform_admin());

ALTER TABLE "BankerContact" ENABLE ROW LEVEL SECURITY;

CREATE POLICY bankercontact_tenant_read ON "BankerContact"
  FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY bankercontact_tenant_insert ON "BankerContact"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY bankercontact_tenant_update ON "BankerContact"
  FOR UPDATE USING ("agencyId" = app_agency_id() OR app_is_platform_admin())
           WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY bankercontact_tenant_delete ON "BankerContact"
  FOR DELETE USING ("agencyId" = app_agency_id() OR app_is_platform_admin());

-- BankOffer has no `agencyId` of its own — it belongs to a case, the same relationship
-- `ListingImage` has to `Listing` — so its policies check the parent's ownership
-- directly, the pattern `20261028180000_listing_image_tenant_policies` fixed ListingImage
-- onto after the subquery-on-visibility mistake documented there. There is no public
-- read here to split out: a mortgage case is never publicly visible the way a listing
-- is, so the parent's ownership is the whole read policy, not half of one.

ALTER TABLE "BankOffer" ENABLE ROW LEVEL SECURITY;

CREATE POLICY bankoffer_tenant_read ON "BankOffer"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "MortgageCase" c
      WHERE c.id = "caseId" AND (c."agencyId" = app_agency_id() OR app_is_platform_admin())
    )
  );
CREATE POLICY bankoffer_tenant_insert ON "BankOffer"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "MortgageCase" c
      WHERE c.id = "caseId" AND (c."agencyId" = app_agency_id() OR app_is_platform_admin())
    )
  );
CREATE POLICY bankoffer_tenant_update ON "BankOffer"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "MortgageCase" c
      WHERE c.id = "caseId" AND (c."agencyId" = app_agency_id() OR app_is_platform_admin())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "MortgageCase" c
      WHERE c.id = "caseId" AND (c."agencyId" = app_agency_id() OR app_is_platform_admin())
    )
  );
CREATE POLICY bankoffer_tenant_delete ON "BankOffer"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "MortgageCase" c
      WHERE c.id = "caseId" AND (c."agencyId" = app_agency_id() OR app_is_platform_admin())
    )
  );
