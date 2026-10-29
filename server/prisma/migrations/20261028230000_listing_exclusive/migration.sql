-- Exclusivity as a column rather than one more string in "amenities".
--
-- It is the agency's commercial claim on a property, not a feature of the building, so
-- it is worth querying, counting and sorting on in a way an array membership test is
-- not. Scraped rows already carry it as the בלעדיות label, which yad2 derives from its
-- own `isAssetExclusive` flag; those are backfilled here so both kinds of listing agree
-- from the first request after this runs, and the search facets that read the label
-- keep working untouched.
ALTER TABLE "Listing" ADD COLUMN "isExclusive" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Listing" SET "isExclusive" = true WHERE 'בלעדיות' = ANY("amenities");
