-- When someone agreed to the terms and the privacy policy. A timestamp rather than a
-- flag, so a later change to either document can be told apart from an account that
-- predates it. Null for accounts created before this column existed.
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
