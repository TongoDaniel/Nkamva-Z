-- Les notes d'un membre sur un replay, gardées sur son compte plutôt que dans
-- son navigateur (revue du 16 novembre 2026). Une note par personne et par
-- replay ; supprimées avec le replay, et à l'effacement du compte.
CREATE TABLE "replay_notes" (
    "id" TEXT NOT NULL,
    "replayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replay_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "replay_notes_userId_idx" ON "replay_notes"("userId");

CREATE UNIQUE INDEX "replay_notes_replayId_userId_key" ON "replay_notes"("replayId", "userId");

ALTER TABLE "replay_notes" ADD CONSTRAINT "replay_notes_replayId_fkey" FOREIGN KEY ("replayId") REFERENCES "replays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "replay_notes" ADD CONSTRAINT "replay_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
