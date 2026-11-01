-- Whether a customer signed the brokerage agreement, and what it says the fee is.
--
-- Under the Real Estate Agents Law a fee can only be claimed where the client signed a
-- written order, so for an agency this is the line between billable work and unpaid
-- work. Nullable throughout: every existing customer is unsigned and unpriced until
-- somebody says otherwise, and null is the honest value for that — not zero, and not
-- a date nobody chose.
ALTER TABLE "Customer"
  ADD COLUMN "agreementSignedAt"          TIMESTAMP(3),
  ADD COLUMN "agreementCommissionPercent" DOUBLE PRECISION,
  ADD COLUMN "agreementCommissionAmount"  INTEGER,
  ADD COLUMN "agreementNote"              TEXT;
