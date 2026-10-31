-- Who owns the property, as a record in the agency's own CRM rather than a name on an ad.
ALTER TABLE "Listing" ADD COLUMN "sellerCustomerId" TEXT;

ALTER TABLE "Listing"
  ADD CONSTRAINT "Listing_sellerCustomerId_fkey"
  FOREIGN KEY ("sellerCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Listing_sellerCustomerId_idx" ON "Listing"("sellerCustomerId");

-- The seller's half of a viewing, kept apart from the buyer's.
ALTER TABLE "Meeting" ADD COLUMN "sellerResponse" "AttendeeResponse" NOT NULL DEFAULT 'pending';
ALTER TABLE "Meeting" ADD COLUMN "sellerRespondedAt" TIMESTAMP(3);
ALTER TABLE "Meeting" ADD COLUMN "sellerNote" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "sellerToken" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "sellerAskedAt" TIMESTAMP(3);

-- Unique so a token resolves to one meeting, partial so the many rows with no token
-- do not all collide on NULL — which they would not in Postgres, but the index is
-- smaller and the intent is plainer this way.
CREATE UNIQUE INDEX "Meeting_sellerToken_key" ON "Meeting"("sellerToken") WHERE "sellerToken" IS NOT NULL;
