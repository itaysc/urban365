-- A chat with an assistant, and the turns in it.
--
-- Enabled with no policy, like User: the agent store reads and writes through the
-- table owner and always filters by the caller. nadlan_app, which has no policy to
-- match, cannot see a transcript at all — including the anonymous ones, which have
-- no user to scope a policy to.

CREATE TABLE "AgentConversation" (
  "id"            TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "agentId"       TEXT NOT NULL,
  "userId"        TEXT,
  "visitorId"     TEXT,
  "summary"       TEXT NOT NULL DEFAULT '',
  "summaryCovers" INTEGER NOT NULL DEFAULT 0,
  "tokensUsed"    INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentMessage" (
  "id"             TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "conversationId" TEXT NOT NULL,
  "role"           TEXT NOT NULL,
  "content"        TEXT NOT NULL DEFAULT '',
  "toolName"       TEXT,
  "toolCallId"     TEXT,
  "toolPayload"    JSONB,

  CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentConversation_userId_agentId_updatedAt_idx"
  ON "AgentConversation"("userId", "agentId", "updatedAt");
CREATE INDEX "AgentConversation_visitorId_agentId_updatedAt_idx"
  ON "AgentConversation"("visitorId", "agentId", "updatedAt");
CREATE INDEX "AgentMessage_conversationId_createdAt_idx"
  ON "AgentMessage"("conversationId", "createdAt");

ALTER TABLE "AgentConversation"
  ADD CONSTRAINT "AgentConversation_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentMessage"
  ADD CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentMessage" ENABLE ROW LEVEL SECURITY;
