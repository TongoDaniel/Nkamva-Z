-- Arbitrage 93 — la salle n'a pas de jauge, la scène a un plafond.
--
-- `onStage` est la place, `mutedByHost` reste le verrou : deux états distincts
-- pour deux causes distinctes. Fondre les deux ferait annoncer « l'animateur
-- vous a coupé le micro » à quelqu'un que personne n'a coupé — la scène était
-- simplement pleine.
--
-- Le défaut est `false` : les séances déjà en base repartent avec une scène
-- vide, et chaque participant reprend une place à sa prochaine entrée en salle,
-- dans la limite du plafond. Poser `true` par défaut aurait rempli d'un coup
-- des scènes de plusieurs dizaines de personnes, soit exactement le coût que
-- cet arbitrage évite.

-- AlterTable
ALTER TABLE "live_participants" ADD COLUMN     "onStage" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "live_participants_sessionId_onStage_idx" ON "live_participants"("sessionId", "onStage");
