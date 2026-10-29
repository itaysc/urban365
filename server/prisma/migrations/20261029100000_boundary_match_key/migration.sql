-- A normalised key to match a city name on.
--
-- OpenStreetMap writes Tel Aviv as `תל־אביב–יפו`, with a maqaf and an en dash, while a
-- scraped listing says `תל אביב יפו` with plain spaces. Neither is wrong and a direct
-- comparison finds nothing, so both sides reduce to this key before they meet. `name`
-- stays exactly as OSM has it, for display.
--
-- The table is reference data refreshed by `npm run boundaries:sync`, so the column is
-- added empty and the next sync fills it — there is no row worth backfilling in SQL,
-- and the normalisation lives in TypeScript where both sides can share it.
ALTER TABLE "CityBoundary" DROP CONSTRAINT IF EXISTS "CityBoundary_name_key";
DROP INDEX IF EXISTS "CityBoundary_name_key";

ALTER TABLE "CityBoundary" ADD COLUMN "matchKey" TEXT;
DELETE FROM "CityBoundary";
ALTER TABLE "CityBoundary" ALTER COLUMN "matchKey" SET NOT NULL;

CREATE UNIQUE INDEX "CityBoundary_matchKey_key" ON "CityBoundary" ("matchKey");
CREATE INDEX "CityBoundary_matchKey_idx" ON "CityBoundary" ("matchKey");
