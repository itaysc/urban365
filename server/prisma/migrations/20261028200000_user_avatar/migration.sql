-- Profile picture. `avatarUrl` is the path this API serves it from; the bytes live in
-- the private bucket under `avatarStorageKey`, which is how the old object is found and
-- removed when the picture is replaced. Null in both means fall back to initials.
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarStorageKey" TEXT;
