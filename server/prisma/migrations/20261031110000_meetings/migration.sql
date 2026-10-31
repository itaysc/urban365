-- An agent's diary: viewings, valuations, signings.
--
-- Ours rather than Google's. An agency that never connects a Google account still has a
-- working calendar, and one that connects gets its meetings pushed there — "we own the
-- record, Google holds a copy", because the other way round loses the diary the moment
-- somebody revokes an OAuth grant.
CREATE TYPE "MeetingStatus" AS ENUM ('scheduled', 'done', 'cancelled');

CREATE TABLE "Meeting" (
  "id"            TEXT NOT NULL,
  "agencyId"      TEXT NOT NULL,
  "customerId"    TEXT,
  "listingId"     TEXT,
  "title"         TEXT NOT NULL,
  "startsAt"      TIMESTAMP(3) NOT NULL,
  "endsAt"        TIMESTAMP(3) NOT NULL,
  "location"      TEXT,
  "notes"         TEXT,
  "status"        "MeetingStatus" NOT NULL DEFAULT 'scheduled',
  "ownerId"       TEXT,
  "googleEventId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- The calendar asks for one range at a time, which is the only query there is.
CREATE INDEX "Meeting_agencyId_startsAt_idx" ON "Meeting" ("agencyId", "startsAt");
CREATE INDEX "Meeting_customerId_idx" ON "Meeting" ("customerId");
CREATE INDEX "Meeting_ownerId_idx" ON "Meeting" ("ownerId");

ALTER TABLE "Meeting"
  ADD CONSTRAINT "Meeting_agencyId_fkey" FOREIGN KEY ("agencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Meeting_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Meeting_listingId_fkey" FOREIGN KEY ("listingId")
    REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Meeting_ownerId_fkey" FOREIGN KEY ("ownerId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_tenant_read ON "Meeting"
  FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY meeting_tenant_insert ON "Meeting"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY meeting_tenant_update ON "Meeting"
  FOR UPDATE USING ("agencyId" = app_agency_id() OR app_is_platform_admin())
           WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY meeting_tenant_delete ON "Meeting"
  FOR DELETE USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
