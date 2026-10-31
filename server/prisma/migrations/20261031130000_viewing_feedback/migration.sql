-- How a viewing went, written down afterwards.
--
-- One outcome rather than an attendance flag plus an interest score: "did not turn up"
-- and "came and hated it" are different outcomes, not the same one with a field
-- missing — and asking an agent two questions where one will do is how summaries stop
-- getting written at all.
CREATE TYPE "ViewingOutcome" AS ENUM ('interested', 'thinking', 'not_interested', 'no_show');

ALTER TABLE "Meeting"
  ADD COLUMN "outcome"       "ViewingOutcome",
  ADD COLUMN "feedbackNotes" TEXT,
  ADD COLUMN "feedbackAt"    TIMESTAMP(3),
  ADD COLUMN "feedbackById"  TEXT;

ALTER TABLE "Meeting"
  ADD CONSTRAINT "Meeting_feedbackById_fkey" FOREIGN KEY ("feedbackById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- What the "still needs a summary" prompt asks for: past, still marked scheduled, no
-- outcome. A partial index because that is a short list out of the whole diary, and it
-- is read on every visit to the calendar.
CREATE INDEX "Meeting_awaiting_feedback_idx" ON "Meeting" ("agencyId", "startsAt" DESC)
  WHERE "outcome" IS NULL AND "status" = 'scheduled';
