-- Who the deal is with.
--
-- A lead is an event — somebody enquired once — and a customer is the relationship that
-- follows it. A deal belongs to the second, and without this column the pipeline and
-- the CRM were two products sharing a database.
ALTER TABLE "Deal" ADD COLUMN "customerId" TEXT;

CREATE INDEX "Deal_customerId_idx" ON "Deal"("customerId");

-- SetNull rather than Cascade: a customer who leaves does not unmake the deal that was
-- done, and an agency's closed-won history is the last thing to delete by accident.
ALTER TABLE "Deal"
  ADD CONSTRAINT "Deal_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
