-- What the system has decided is worth an agent's attention.
--
-- The status is what makes this a suggestion rather than a dashboard tile: somebody can
-- be done with one, or say no to it, and the sweep has to respect that forever.
-- `dedupeKey` is the identity of the *observation* rather than of the row, so a sweep
-- that notices the same thing tomorrow finds the dismissed row and leaves it alone.
CREATE TYPE "SuggestionKind" AS ENUM ('new_match');
CREATE TYPE "SuggestionStatus" AS ENUM ('open', 'done', 'dismissed');

CREATE TABLE "Suggestion" (
  "id"           TEXT NOT NULL,
  "agencyId"     TEXT NOT NULL,
  "ownerId"      TEXT,
  "kind"         "SuggestionKind" NOT NULL,
  "status"       "SuggestionStatus" NOT NULL DEFAULT 'open',
  "customerId"   TEXT,
  "listingId"    TEXT,
  "score"        INTEGER NOT NULL,
  "reason"       TEXT NOT NULL,
  "snoozedUntil" TIMESTAMP(3),
  "actedAt"      TIMESTAMP(3),
  "dedupeKey"    TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Suggestion_dedupeKey_key" ON "Suggestion"("dedupeKey");
CREATE INDEX "Suggestion_agencyId_status_score_idx" ON "Suggestion"("agencyId", "status", "score");
CREATE INDEX "Suggestion_ownerId_status_idx" ON "Suggestion"("ownerId", "status");
CREATE INDEX "Suggestion_customerId_idx" ON "Suggestion"("customerId");
CREATE INDEX "Suggestion_listingId_idx" ON "Suggestion"("listingId");

-- The subjects cascade rather than SetNull: a suggestion about a deleted customer is
-- not a suggestion with a hole in it, it is nothing at all.
ALTER TABLE "Suggestion"
  ADD CONSTRAINT "Suggestion_agencyId_fkey" FOREIGN KEY ("agencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Suggestion_ownerId_fkey" FOREIGN KEY ("ownerId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Suggestion_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Suggestion_listingId_fkey" FOREIGN KEY ("listingId")
    REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant-only, the same four policies every agency-owned table gets.
ALTER TABLE "Suggestion" ENABLE ROW LEVEL SECURITY;

CREATE POLICY suggestion_tenant_read ON "Suggestion"
  FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY suggestion_tenant_insert ON "Suggestion"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY suggestion_tenant_update ON "Suggestion"
  FOR UPDATE USING ("agencyId" = app_agency_id() OR app_is_platform_admin())
           WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY suggestion_tenant_delete ON "Suggestion"
  FOR DELETE USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
