-- Arbitrage 144 — le partage d'écran d'un participant passe par l'animateur.
--
-- Deux horodatages plutôt qu'un booléen, pour la raison qui a fait choisir
-- `handRaisedAt` : la demande se range dans une file, de la plus ancienne à la
-- plus récente, et l'autorisation se lit dans le journal.
ALTER TABLE "live_participants" ADD COLUMN "screenRequestedAt" TIMESTAMP(3);
ALTER TABLE "live_participants" ADD COLUMN "screenAllowedAt" TIMESTAMP(3);

CREATE INDEX "live_participants_sessionId_screenRequestedAt_idx" ON "live_participants"("sessionId", "screenRequestedAt");
