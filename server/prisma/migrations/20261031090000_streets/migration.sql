-- Every street in Israel, from the Interior Ministry's list via data.gov.il.
--
-- A table rather than a file in the browser bundle: 63,000 streets is a megabyte nobody
-- should download to fill in one address field.
CREATE TABLE "Street" (
  "id"       TEXT NOT NULL,
  "city"     TEXT NOT NULL,
  "cityKey"  TEXT NOT NULL,
  "name"     TEXT NOT NULL,
  "code"     INTEGER,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Street_pkey" PRIMARY KEY ("id")
);

-- One row per street per city, which is what the sync upserts on.
CREATE UNIQUE INDEX "Street_cityKey_name_key" ON "Street" ("cityKey", "name");

-- Reference data, like the boundaries: readable by anybody, written only by the owner
-- role the sync script connects as.
ALTER TABLE "Street" ENABLE ROW LEVEL SECURITY;
CREATE POLICY street_public_read ON "Street" FOR SELECT USING (true);
