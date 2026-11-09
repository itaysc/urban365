-- An admin's session can act as another account. The row stays the admin's;
-- deleting the other account ends the impersonation rather than the session.
ALTER TABLE "Session" ADD COLUMN "impersonatingUserId" TEXT;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_impersonatingUserId_fkey"
  FOREIGN KEY ("impersonatingUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
