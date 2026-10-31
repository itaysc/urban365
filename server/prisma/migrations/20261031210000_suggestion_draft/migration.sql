-- A message to the customer, written by the model and not sent by it. Stored rather
-- than generated per view: it costs money, the wording should not change under an
-- agent between one visit and the next, and a draft they edited is theirs.
ALTER TABLE "Suggestion" ADD COLUMN "draft" TEXT;
ALTER TABLE "Suggestion" ADD COLUMN "draftAt" TIMESTAMP(3);
