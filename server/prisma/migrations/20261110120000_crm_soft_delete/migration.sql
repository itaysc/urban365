-- Soft-delete for the CRM's own records, to match what `Agency` and `Listing`
-- already do (a status/removedAt the row survives under) rather than a hard
-- `DELETE`. These five are the ones an agent removes one at a time in the course of
-- ordinary work, where a mis-click should be an "undo", not a call to support.
--
-- No RLS change: these columns do not affect tenant isolation, only which rows the
-- application's own queries choose to show. Reads already run on the tenant client
-- scoped to `agencyId`; `deletedAt` is filtered the same way `status` already is.

ALTER TABLE "Lead" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Deal" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "MortgageCase" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "BankerContact" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Lead_agencyId_deletedAt_idx" ON "Lead"("agencyId", "deletedAt");
CREATE INDEX "Customer_agencyId_deletedAt_idx" ON "Customer"("agencyId", "deletedAt");
CREATE INDEX "Deal_agencyId_deletedAt_idx" ON "Deal"("agencyId", "deletedAt");
CREATE INDEX "MortgageCase_agencyId_deletedAt_idx" ON "MortgageCase"("agencyId", "deletedAt");
CREATE INDEX "BankerContact_agencyId_deletedAt_idx" ON "BankerContact"("agencyId", "deletedAt");
