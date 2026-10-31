-- When to go back to somebody after a viewing.
--
-- A date on the meeting rather than a second meeting: "ring them on Thursday" is not an
-- appointment, and putting it in the diary as one makes a calendar nobody trusts.
ALTER TABLE "Meeting"
  ADD COLUMN "followUpAt"     TIMESTAMP(3),
  ADD COLUMN "followUpDoneAt" TIMESTAMP(3);

-- What the "to chase" list asks for: due, not done. A partial index because it is a
-- handful of rows out of the whole diary and it is read on every visit to the calendar.
CREATE INDEX "Meeting_follow_up_due_idx" ON "Meeting" ("agencyId", "followUpAt")
  WHERE "followUpAt" IS NOT NULL AND "followUpDoneAt" IS NULL;
