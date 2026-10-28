-- The object key behind the agency banner. `coverImageUrl` is the path this API serves
-- it from; the bytes live in a private bucket and this is how they are found again —
-- to delete the old one when the banner is replaced, above all.
ALTER TABLE "Agency" ADD COLUMN "coverStorageKey" TEXT;
