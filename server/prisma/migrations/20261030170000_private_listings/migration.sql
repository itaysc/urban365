-- A person selling their own property, and the counts that tell them how it is doing.

CREATE TYPE "EngagementKind" AS ENUM ('view', 'phone');

ALTER TABLE "Listing"
  ALTER COLUMN "agencyId" DROP NOT NULL,
  ADD COLUMN "ownerUserId"      TEXT,
  ADD COLUMN "viewCount"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "phoneRevealCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Listing"
  ADD CONSTRAINT "Listing_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one owner. Neither would be a listing nobody can edit; both would make every
-- "whose is this?" answer depend on which column the reader happened to check.
ALTER TABLE "Listing"
  ADD CONSTRAINT "Listing_one_seller"
  CHECK (("agencyId" IS NOT NULL) <> ("ownerUserId" IS NOT NULL));

CREATE INDEX "Listing_ownerUserId_idx" ON "Listing" ("ownerUserId");

CREATE TABLE "ListingEngagement" (
  "id"        TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "kind"      "EngagementKind" NOT NULL,
  "userId"    TEXT,
  "visitorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ListingEngagement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ListingEngagement"
  ADD CONSTRAINT "ListingEngagement_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ListingEngagement_listingId_kind_idx" ON "ListingEngagement" ("listingId", "kind");

-- One row per person per listing per kind. Partial, because Postgres counts NULLs as
-- distinct and a plain unique over a nullable column would record the same person
-- endlessly — which is exactly the "views" number that means nothing.
CREATE UNIQUE INDEX "ListingEngagement_user_key"
  ON "ListingEngagement" ("listingId", "kind", "userId") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX "ListingEngagement_visitor_key"
  ON "ListingEngagement" ("listingId", "kind", "visitorId") WHERE "visitorId" IS NOT NULL;

-- Readable by nobody through the tenant role: a seller's figures are their own, and
-- they are served through the application, which knows whose listing it is.
ALTER TABLE "ListingEngagement" ENABLE ROW LEVEL SECURITY;

-- A private listing belongs to no agency, so the existing tenant policies — which
-- compare `agencyId = app_agency_id()` — already exclude it: NULL = anything is NULL.
-- Stated here so the next person reading the policies knows it is deliberate.
