-- Regions ("מרכז והשרון", "חיפה והקריות") alongside the municipalities already stored.
CREATE TYPE "BoundaryKind" AS ENUM ('city', 'district');

ALTER TABLE "CityBoundary"
  ADD COLUMN "kind" "BoundaryKind" NOT NULL DEFAULT 'city',
  ADD COLUMN "memberCities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- A region is assembled from several OSM relations, so it is not one of them.
ALTER TABLE "CityBoundary" ALTER COLUMN "osmRelationId" DROP NOT NULL;

-- A name is unique within a kind, not across both: `חיפה` is a city, and also a word in
-- a region's name.
DROP INDEX IF EXISTS "CityBoundary_matchKey_key";
CREATE UNIQUE INDEX "CityBoundary_kind_matchKey_key" ON "CityBoundary" ("kind", "matchKey");
CREATE INDEX "CityBoundary_kind_idx" ON "CityBoundary" ("kind");
