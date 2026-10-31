-- Three more things worth an agent's attention, and the two subjects they are about.
ALTER TYPE "SuggestionKind" ADD VALUE 'viewing_unanswered';
ALTER TYPE "SuggestionKind" ADD VALUE 'stale_lead';
ALTER TYPE "SuggestionKind" ADD VALUE 'listing_no_interest';

ALTER TABLE "Suggestion" ADD COLUMN "leadId" TEXT;
ALTER TABLE "Suggestion" ADD COLUMN "meetingId" TEXT;

CREATE INDEX "Suggestion_leadId_idx" ON "Suggestion"("leadId");
CREATE INDEX "Suggestion_meetingId_idx" ON "Suggestion"("meetingId");

-- Cascading for the same reason as the other two: a suggestion about a deleted lead is
-- not a suggestion with a hole in it, it is nothing at all.
ALTER TABLE "Suggestion"
  ADD CONSTRAINT "Suggestion_leadId_fkey" FOREIGN KEY ("leadId")
    REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Suggestion_meetingId_fkey" FOREIGN KEY ("meetingId")
    REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
