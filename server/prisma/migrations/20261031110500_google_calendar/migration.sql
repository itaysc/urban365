-- A user's connected Google Calendar.
--
-- Its own table rather than columns on "User", so disconnecting is a DELETE and there
-- is no half-connected state with a stale refresh token beside a null calendar id.
--
-- The refresh token is stored as given. Every other token in this schema is kept as a
-- sha256 hash because it only ever needs comparing; this one has to be *used*, so
-- hashing it would make it useless. It is a credential for somebody's calendar.
CREATE TABLE "GoogleCalendarAccount" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "googleEmail"  TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "calendarId"   TEXT NOT NULL DEFAULT 'primary',
  "lastError"    TEXT,
  "lastSyncAt"   TIMESTAMP(3),
  "connectedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GoogleCalendarAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleCalendarAccount_userId_key" ON "GoogleCalendarAccount" ("userId");

ALTER TABLE "GoogleCalendarAccount"
  ADD CONSTRAINT "GoogleCalendarAccount_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enabled with no policy, like "User" and the auth tables: total denial to the tenant
-- role. Nothing tenant-facing may read somebody's calendar credential — the calendar
-- service runs on the owner client and scopes by user id itself.
ALTER TABLE "GoogleCalendarAccount" ENABLE ROW LEVEL SECURITY;
