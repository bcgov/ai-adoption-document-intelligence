-- Seeded demo transcripts are group-visible, read-only replays rather than
-- one user's private chat. Flagging them on the row is what lets the
-- conversation list show a demo to whoever opens the demo link, without
-- widening access to anybody's real conversations.
ALTER TABLE "chat_conversation" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;
