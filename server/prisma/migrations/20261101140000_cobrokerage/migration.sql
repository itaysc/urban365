-- One agency asking another to work a deal together.
CREATE TYPE "CoBrokerageStatus" AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');

-- On by default: the inventory it exposes is already public on the marketplace, and a
-- network nobody has joined is worth nothing to the first agency that joins it.
ALTER TABLE "Agency" ADD COLUMN "coBrokerage" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "CoBrokerageRequest" (
  "id"              TEXT NOT NULL,
  "listingId"       TEXT NOT NULL,
  "holdingAgencyId" TEXT NOT NULL,
  "seekingAgencyId" TEXT NOT NULL,
  "customerId"      TEXT,
  "requestedById"   TEXT,
  "respondedById"   TEXT,
  "status"          "CoBrokerageStatus" NOT NULL DEFAULT 'pending',
  "message"         TEXT,
  "commissionSplit" INTEGER NOT NULL DEFAULT 50,
  "briefSummary"    TEXT,
  "respondedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CoBrokerageRequest_pkey" PRIMARY KEY ("id")
);

-- One ask per buyer per property. Asking twice is not a second opportunity, it is the
-- same one with a nag attached.
CREATE UNIQUE INDEX "CoBrokerageRequest_listingId_seekingAgencyId_customerId_key"
  ON "CoBrokerageRequest"("listingId", "seekingAgencyId", "customerId");

CREATE INDEX "CoBrokerageRequest_holdingAgencyId_status_idx"
  ON "CoBrokerageRequest"("holdingAgencyId", "status");
CREATE INDEX "CoBrokerageRequest_seekingAgencyId_status_idx"
  ON "CoBrokerageRequest"("seekingAgencyId", "status");

ALTER TABLE "CoBrokerageRequest"
  ADD CONSTRAINT "CoBrokerageRequest_listingId_fkey" FOREIGN KEY ("listingId")
    REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CoBrokerageRequest_holdingAgencyId_fkey" FOREIGN KEY ("holdingAgencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CoBrokerageRequest_seekingAgencyId_fkey" FOREIGN KEY ("seekingAgencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CoBrokerageRequest_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CoBrokerageRequest_requestedById_fkey" FOREIGN KEY ("requestedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CoBrokerageRequest_respondedById_fkey" FOREIGN KEY ("respondedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The only table in the system that belongs to two agencies, so its policies name both.
--
-- Read is either side's. Insert is the asking side's alone — an agency cannot write
-- itself a request to work on somebody else's listing. Update is either side's, and
-- which fields each may actually change is enforced in the service, because a policy
-- cannot see the difference between accepting and withdrawing.
--
-- Note what this deliberately does NOT do: hide `customerId` from the holding agency.
-- Row-level security has no column dimension, so the buyer is kept out of the holding
-- side's responses by the service's own projection, and a test holds that line.
ALTER TABLE "CoBrokerageRequest" ENABLE ROW LEVEL SECURITY;

CREATE POLICY cobrokerage_party_read ON "CoBrokerageRequest"
  FOR SELECT USING (
    "holdingAgencyId" = app_agency_id()
    OR "seekingAgencyId" = app_agency_id()
    OR app_is_platform_admin()
  );

CREATE POLICY cobrokerage_seeker_insert ON "CoBrokerageRequest"
  FOR INSERT WITH CHECK ("seekingAgencyId" = app_agency_id() OR app_is_platform_admin());

CREATE POLICY cobrokerage_party_update ON "CoBrokerageRequest"
  FOR UPDATE USING (
    "holdingAgencyId" = app_agency_id()
    OR "seekingAgencyId" = app_agency_id()
    OR app_is_platform_admin()
  )
  WITH CHECK (
    "holdingAgencyId" = app_agency_id()
    OR "seekingAgencyId" = app_agency_id()
    OR app_is_platform_admin()
  );

-- No delete policy on purpose: a request that was made is a thing that happened, and
-- withdrawing is a status rather than a disappearance.
