-- La contrainte de forme interdisait la purge qu'exige l'arbitrage 80.
--
-- `community_invitations_shape_check` posait, pour une nominative :
--   kind = 'NOMINATIVE' AND email IS NOT NULL AND "maxUses" = 1
--
-- Or la purge RGPD à 90 jours (`purgeStaleInvitations`) vide précisément
-- `email` : les deux règles étaient incompatibles, et le job aurait échoué
-- chaque nuit — mais seulement après 90 jours de production, quand la première
-- invitation serait devenue purgeable. Le genre de panne qui n'apparaît pas en
-- développement.
--
-- L'adresse peut donc manquer **à condition que la ligne soit anonymisée** :
-- `anonymizedAt` est ce qui distingue « adresse effacée par la purge » de
-- « adresse jamais renseignée », que la contrainte doit continuer d'interdire.
--
-- Pourquoi NULL et non un marqueur : l'index unique partiel
-- `community_invitations_open_nominative_unique` porte sur ("communityId",
-- email) et, en Postgres, deux NULL ne se heurtent pas. Un marqueur constant,
-- lui, ferait collision entre deux invitations expirées de la même communauté —
-- une invitation expirée a `revokedAt` et `acceptedAt` nuls, elle est donc
-- toujours dans l'index.

ALTER TABLE "community_invitations" DROP CONSTRAINT "community_invitations_shape_check";

ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_shape_check" CHECK (
  ("kind" = 'NOMINATIVE' AND ("email" IS NOT NULL OR "anonymizedAt" IS NOT NULL) AND "maxUses" = 1)
  OR
  ("kind" = 'SHARE_LINK' AND "email" IS NULL AND "grant" = 'PAID' AND "maxUses" >= 1)
);
