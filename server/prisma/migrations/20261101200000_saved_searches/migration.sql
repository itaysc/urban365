-- A search somebody wants to be told about.
--
-- The criteria are the public search's own filters rather than a new vocabulary, so the
-- email can link back to exactly the search that produced it, and the matching code is
-- the same one the agency side uses for a customer's brief.
CREATE TABLE "SavedSearch" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "section"        "Section",
  "cities"         TEXT[] DEFAULT ARRAY[]::TEXT[],
  "propertyTypes"  TEXT[] DEFAULT ARRAY[]::TEXT[],
  "minRooms"       DOUBLE PRECISION,
  "maxRooms"       DOUBLE PRECISION,
  "minPrice"       INTEGER,
  "maxPrice"       INTEGER,
  "minSquareMeter" INTEGER,
  "alert"          BOOLEAN NOT NULL DEFAULT true,
  "lastAlertAt"    TIMESTAMP(3),
  -- Starts at creation, so a search saved today does not open with the back catalogue.
  "notifiedUpTo"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedSearch_userId_createdAt_idx" ON "SavedSearch"("userId", "createdAt");
CREATE INDEX "SavedSearch_alert_lastAlertAt_idx" ON "SavedSearch"("alert", "lastAlertAt");

ALTER TABLE "SavedSearch"
  ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Theirs alone, like the rest of the buyer's things: one policy on the user, not four
-- on an agency. A saved search is nobody else's business, an agency's included.
ALTER TABLE "SavedSearch" ENABLE ROW LEVEL SECURITY;

CREATE POLICY savedsearch_own ON "SavedSearch"
  USING      ("userId" = app_user_id())
  WITH CHECK ("userId" = app_user_id());
