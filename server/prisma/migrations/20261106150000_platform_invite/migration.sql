-- CreateTable
CREATE TABLE "PlatformInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvite_tokenHash_key" ON "PlatformInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PlatformInvite_email_acceptedAt_idx" ON "PlatformInvite"("email", "acceptedAt");

-- AddForeignKey
ALTER TABLE "PlatformInvite" ADD CONSTRAINT "PlatformInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No policy on purpose. Enabled with none is total denial for the tenant role;
-- platform staff read and write this on the owner connection, which bypasses RLS.
ALTER TABLE "PlatformInvite" ENABLE ROW LEVEL SECURITY;
