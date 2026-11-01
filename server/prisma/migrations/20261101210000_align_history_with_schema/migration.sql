-- Brings the migration history back in line with schema.prisma.
--
-- Several of the migrations before this one were written by hand, and four changes to
-- the schema never got one of their own: two indexes dropped from the models, one added
-- to Street, and the array defaults that a Prisma upgrade stopped emitting. The local
-- database had them because it was pushed to directly; a fresh deploy would not, so
-- `Street` would have gone to production missing the index its lookups are written
-- around.
--
-- Found when the next migration tried to sweep all four up under its own name.

-- DropIndex
DROP INDEX IF EXISTS "CityBoundary_matchKey_idx";

-- DropIndex
DROP INDEX IF EXISTS "Lead_ownerUserId_idx";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Street_cityKey_name_idx" ON "Street"("cityKey", "name");

-- AlterTable: Prisma no longer emits a default for a list column.
ALTER TABLE "CityBoundary" ALTER COLUMN "memberCities" DROP DEFAULT;
ALTER TABLE "Customer" ALTER COLUMN "lookingCities" DROP DEFAULT,
                       ALTER COLUMN "lookingTypes" DROP DEFAULT;
ALTER TABLE "SavedSearch" ALTER COLUMN "cities" DROP DEFAULT,
                          ALTER COLUMN "propertyTypes" DROP DEFAULT;
