-- Administrative outlines for the map, so a search for a city can show that city's area.
--
-- Stored rather than fetched live: Nominatim's usage policy forbids systematic querying,
-- Overpass rate-limits anonymous callers and was already refusing requests during
-- development, and a municipal boundary changes about never. One sync, then the map owes
-- nothing to either service at request time.
--
-- The geometry is a whole GeoJSON value rather than normalised points, because nothing
-- queries inside it — the map only draws it.
CREATE TABLE "CityBoundary" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "nameEn"        TEXT,
  "osmRelationId" BIGINT NOT NULL,
  "adminLevel"    INTEGER NOT NULL DEFAULT 8,
  "geometry"      JSONB NOT NULL,
  "minLat"        DOUBLE PRECISION NOT NULL,
  "maxLat"        DOUBLE PRECISION NOT NULL,
  "minLng"        DOUBLE PRECISION NOT NULL,
  "maxLng"        DOUBLE PRECISION NOT NULL,
  "syncedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CityBoundary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CityBoundary_name_key" ON "CityBoundary" ("name");
CREATE UNIQUE INDEX "CityBoundary_osmRelationId_key" ON "CityBoundary" ("osmRelationId");
CREATE INDEX "CityBoundary_adminLevel_idx" ON "CityBoundary" ("adminLevel");

-- Public reference data: readable by anyone, writable only by the sync, which runs as
-- the owner role. Enabled-with-a-read-only-policy rather than left open, so the table
-- follows the same rule as everything else.
ALTER TABLE "CityBoundary" ENABLE ROW LEVEL SECURITY;
CREATE POLICY cityboundary_public_read ON "CityBoundary" FOR SELECT USING (true);
GRANT SELECT ON "CityBoundary" TO nadlan_app;
