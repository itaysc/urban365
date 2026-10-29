-- Developer-sold apartments (דירה מקבלן), marked by the agency.
ALTER TABLE "Listing"
  ADD COLUMN "isNewFromDeveloper" BOOLEAN NOT NULL DEFAULT false;

-- Partial, because the column is a boolean where almost every row is false: a plain
-- index on two values would never be chosen, while this one covers exactly the query
-- the filter makes and stays small.
CREATE INDEX "Listing_new_from_developer_idx"
  ON "Listing" ("section", "city")
  WHERE "isNewFromDeveloper";
