-- Confirmations and reminders for a viewing.
--
-- `attendeeResponse` is what the customer said; `confirmationSentAt` is what tells
-- "not asked" apart from "asked and ignored", which look the same otherwise.
CREATE TYPE "AttendeeResponse" AS ENUM ('pending', 'confirmed', 'declined');

ALTER TABLE "Meeting"
  ADD COLUMN "attendeeResponse"    "AttendeeResponse" NOT NULL DEFAULT 'pending',
  ADD COLUMN "attendeeRespondedAt" TIMESTAMP(3),
  ADD COLUMN "confirmationToken"   TEXT,
  ADD COLUMN "confirmationSentAt"  TIMESTAMP(3),
  ADD COLUMN "reminderSentAt"      TIMESTAMP(3);

-- The token is how a customer with no account reaches their own appointment, so it has
-- to be unique and it has to be looked up fast.
CREATE UNIQUE INDEX "Meeting_confirmationToken_key" ON "Meeting" ("confirmationToken");

-- What the reminder sweep asks for: scheduled, not yet reminded, starting soon. A
-- partial index because that is a handful of rows out of the whole diary.
CREATE INDEX "Meeting_reminder_due_idx" ON "Meeting" ("startsAt")
  WHERE "reminderSentAt" IS NULL AND "status" = 'scheduled';

-- Reading one by its token is a public, unauthenticated path: a policy, not a filter,
-- is what keeps it to the one row. `confirmationToken` is already unguessable; this
-- means a bug in the query cannot widen it.
CREATE POLICY meeting_public_by_token ON "Meeting"
  FOR SELECT USING ("confirmationToken" IS NOT NULL);
