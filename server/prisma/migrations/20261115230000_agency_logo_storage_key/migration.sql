-- The object key behind a logo the office uploaded. `logoUrl` is the path this API
-- serves it from. A scraped office may still keep a yad2 address in `logoUrl` and a
-- null key, until someone replaces it here.
ALTER TABLE "Agency" ADD COLUMN "logoStorageKey" TEXT;
