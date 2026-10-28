-- A short self-description for an agent, shown beside their listings. Unbounded in the
-- database and capped in the DTO, so changing the limit later needs no migration.
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
