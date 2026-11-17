-- The CRM assistant scopes a transcript to one office. Without this, a person who
-- moves agencies would reopen a chat that still named the previous office's customers.

ALTER TABLE "AgentConversation" ADD COLUMN "agencyId" TEXT;

CREATE INDEX "AgentConversation_agencyId_userId_agentId_updatedAt_idx"
  ON "AgentConversation"("agencyId", "userId", "agentId", "updatedAt");
