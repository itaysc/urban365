-- An earlier import stored yad2's own image addresses. Uploads are paths this API
-- serves (`/api/...`) and, for a logo, have a storage key. Those stay.
UPDATE "Agency"
SET "logoUrl" = NULL
WHERE "logoStorageKey" IS NULL
  AND "logoUrl" IS NOT NULL
  AND "logoUrl" NOT LIKE '/api/%';

UPDATE "Broker"
SET "avatarUrl" = NULL
WHERE "avatarUrl" IS NOT NULL
  AND "avatarUrl" NOT LIKE '/api/%';
