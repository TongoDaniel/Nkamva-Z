-- Enregistrement des replays par Mux (arbitrage 38).
--
-- Répartition des rôles : LiveKit transporte le direct, Mux enregistre et
-- rediffuse. L'egress LiveKit pousse la composition de la salle vers l'ingestion
-- RTMP de Mux, qui produit un asset et prévient par webhook.
--
-- Conséquence sur le quota du formateur (arbitrage 54) : un replay hébergé par
-- Mux ne consomme pas son espace, et `sizeBytes` reste nul à dessein — l'octet
-- n'est pas chez nous.
ALTER TABLE "live_sessions" ADD COLUMN "muxStreamId" TEXT;
ALTER TABLE "replays" ADD COLUMN "muxAssetId" TEXT;
ALTER TABLE "replays" ADD COLUMN "muxPlaybackId" TEXT;

-- Le webhook Mux retrouve la séance par son flux d'ingestion.
CREATE INDEX "live_sessions_muxStreamId_idx" ON "live_sessions"("muxStreamId");
