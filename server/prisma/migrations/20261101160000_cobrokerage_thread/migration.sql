-- What happens after two agencies agree to work together.
CREATE TYPE "CoBrokerageStage" AS ENUM (
  'agreed', 'viewing', 'negotiating', 'signed', 'completed', 'fell_through'
);

-- A second axis from `status`, not a continuation of it: `status` is whether they
-- agreed, and this is what has happened since. Null until somebody accepts.
ALTER TABLE "CoBrokerageRequest" ADD COLUMN "stage" "CoBrokerageStage";

-- When each side last read the thread. Per side rather than per message: the question
-- an unread badge answers is "is there something new for me".
ALTER TABLE "CoBrokerageRequest" ADD COLUMN "seekerReadAt" TIMESTAMP(3);
ALTER TABLE "CoBrokerageRequest" ADD COLUMN "holderReadAt" TIMESTAMP(3);

CREATE TABLE "CoBrokerageMessage" (
  "id"        TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "agencyId"  TEXT NOT NULL,
  "authorId"  TEXT,
  "body"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoBrokerageMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoBrokerageMessage_requestId_createdAt_idx"
  ON "CoBrokerageMessage"("requestId", "createdAt");

ALTER TABLE "CoBrokerageMessage"
  ADD CONSTRAINT "CoBrokerageMessage_requestId_fkey" FOREIGN KEY ("requestId")
    REFERENCES "CoBrokerageRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CoBrokerageMessage_agencyId_fkey" FOREIGN KEY ("agencyId")
    REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CoBrokerageMessage_authorId_fkey" FOREIGN KEY ("authorId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Scoped through the request it belongs to, the way listing images are scoped through
-- their listing. A message has no agency of its own to compare — it has the agency that
-- wrote it, which is the wrong question: the right one is whether the reader is a party
-- to the conversation.
ALTER TABLE "CoBrokerageMessage" ENABLE ROW LEVEL SECURITY;

CREATE POLICY cobrokeragemessage_party_read ON "CoBrokerageMessage"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "CoBrokerageRequest" r
      WHERE r.id = "requestId"
        AND (
          r."holdingAgencyId" = app_agency_id()
          OR r."seekingAgencyId" = app_agency_id()
          OR app_is_platform_admin()
        )
    )
  );

-- Writing is narrower than reading: a party may add a message, and only in its own
-- name. Without the second condition an agency could post as the other one.
CREATE POLICY cobrokeragemessage_party_insert ON "CoBrokerageMessage"
  FOR INSERT WITH CHECK (
    ("agencyId" = app_agency_id() OR app_is_platform_admin())
    AND EXISTS (
      SELECT 1 FROM "CoBrokerageRequest" r
      WHERE r.id = "requestId"
        AND (
          r."holdingAgencyId" = app_agency_id()
          OR r."seekingAgencyId" = app_agency_id()
          OR app_is_platform_admin()
        )
    )
  );

-- No update or delete policy: a message that was sent is a thing that was said, and
-- the whole point of keeping the thread here is that neither side can rewrite it.
