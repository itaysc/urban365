-- The morning email of what is worth doing today.
--
-- `lastBriefingAt` is both the record and the lock: it is claimed with a conditional
-- update before the mail goes out, so two instances sweeping at the same second cannot
-- both send. On by default, because a work tool that has to be switched on is one
-- nobody switches on.
ALTER TABLE "User" ADD COLUMN "dailyBriefing" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "lastBriefingAt" TIMESTAMP(3);

-- The sweep asks for "everybody who wants one and has not had one today", which is a
-- small slice of the table and should stay an index scan as the table grows.
CREATE INDEX "User_dailyBriefing_lastBriefingAt_idx"
  ON "User"("dailyBriefing", "lastBriefingAt")
  WHERE "dailyBriefing" = true;
