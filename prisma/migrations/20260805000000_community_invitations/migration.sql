-- Invitations aux communautés — arbitrages 71 à 86 (docs/invitations.md).
--
-- Une invitation est un droit d'entrer, matérialisé par un jeton dans une URL.
-- Elle ne crée aucun compte, ne prélève rien, et ne lève aucune décision de
-- modération.
--
-- Deux attributs distincts, et c'est le cœur du modèle :
--   `kind`  — la forme : NOMINATIVE (adressée, usage unique) ou SHARE_LINK ;
--   `grant` — la nature : GIFT (mois offerts) ou PAID (tunnel d'adhésion).
-- Les confondre rendrait toute communauté privée gratuite à vie, puisqu'elle ne
-- s'entre qu'au nominatif (arbitrages 73 et 74).
--
-- Le **statut n'est pas une colonne** : il se déduit de `revokedAt`,
-- `acceptedAt`, `usesCount` et `expiresAt`. Une colonne mentirait le jour où
-- l'expiration tombe, sans que rien ne l'ait écrite.

-- CreateEnum
CREATE TYPE "CommunityVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "InvitationKind" AS ENUM ('NOMINATIVE', 'SHARE_LINK');

-- CreateEnum
CREATE TYPE "InvitationGrant" AS ENUM ('GIFT', 'PAID');

-- CreateEnum
CREATE TYPE "InvitationIssuerRole" AS ENUM ('TRAINER', 'MEMBER');

-- AlterTable
-- Arbitrage 81. `status` dit si la communauté vit, `visibility` dit si on peut
-- la trouver. Une privée reste `active` : elle est fermée, pas close.
ALTER TABLE "communities" ADD COLUMN     "visibility" "CommunityVisibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
-- ⚠️ Le point le plus délicat de cette migration : `provider` devient nullable.
-- Un provider nul **est** la définition d'une adhésion offerte (arbitrage 77) —
-- aucun moyen de paiement n'y a jamais été attaché, il n'y a donc rien avec quoi
-- la reconduire. C'est ce que lit `renewDueMemberships` pour la fermer au lieu
-- d'ouvrir une échéance.
--
-- C'est une relaxation de contrainte : aucune ligne existante n'est touchée,
-- aucune reprise de données. La marche arrière, en revanche, exigerait de
-- traiter les adhésions offertes déjà créées.
ALTER TABLE "community_subscriptions" ADD COLUMN     "invitationId" TEXT,
ALTER COLUMN "provider" DROP NOT NULL;

-- AlterTable
-- Porte l'invitation payante de l'initiation jusqu'au webhook : c'est là, et là
-- seulement, qu'elle sera consommée (arbitrage 78).
ALTER TABLE "purchases" ADD COLUMN     "invitationId" TEXT;

-- CreateTable
CREATE TABLE "community_invitations" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "issuerRole" "InvitationIssuerRole" NOT NULL,
    "kind" "InvitationKind" NOT NULL,
    "grant" "InvitationGrant" NOT NULL,
    "email" TEXT,
    "giftMonths" INTEGER,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_invitations_tokenHash_key" ON "community_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "community_invitations_communityId_createdAt_idx" ON "community_invitations"("communityId", "createdAt");

-- CreateIndex
CREATE INDEX "community_invitations_issuerId_createdAt_idx" ON "community_invitations"("issuerId", "createdAt");

-- CreateIndex
CREATE INDEX "community_invitations_expiresAt_idx" ON "community_invitations"("expiresAt");

-- CreateIndex
CREATE INDEX "communities_visibility_status_idx" ON "communities"("visibility", "status");

-- AddForeignKey
-- `SET NULL` et non `RESTRICT` : l'attribution est un confort d'analyse, elle ne
-- doit jamais empêcher de supprimer une invitation ni retenir une communauté.
-- Une adhésion, elle, survit toujours à l'invitation qui l'a amenée.
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "community_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_subscriptions" ADD CONSTRAINT "community_subscriptions_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "community_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Contraintes que Prisma ne sait pas exprimer — même procédé que la contrainte
-- CHECK de `favorites` et les index uniques partiels des achats.
-- ---------------------------------------------------------------------------

-- La gratuité est nominative (arbitrage 72), une nominative ne s'accepte qu'une
-- fois (arbitrage 71), et un lien partageable ne mène qu'au tarif
-- (arbitrage 74). Trois règles de forme, une seule contrainte : elles ne se
-- contredisent jamais, elles se complètent.
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_shape_check" CHECK (
  ("kind" = 'NOMINATIVE' AND "email" IS NOT NULL AND "maxUses" = 1)
  OR
  ("kind" = 'SHARE_LINK' AND "email" IS NULL AND "grant" = 'PAID' AND "maxUses" >= 1)
);

-- 1 à 3 mois offerts, et rien d'autre (arbitrage 75). Le plafond est ici plutôt
-- qu'au fond d'une validation Zod : une gratuité de douze mois posée par une
-- route oubliée coûterait de l'argent réel au formateur.
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_gift_check" CHECK (
  ("grant" = 'GIFT' AND "giftMonths" BETWEEN 1 AND 3)
  OR
  ("grant" = 'PAID' AND "giftMonths" IS NULL)
);

-- Le compteur ne dépasse jamais le plafond. La garde applicative est un
-- `UPDATE ... WHERE "usesCount" < "maxUses"` ; celle-ci la rend infalsifiable.
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_uses_check" CHECK (
  "usesCount" <= "maxUses"
);

-- Une seule invitation nominative ouverte par (communauté, adresse) : réinviter
-- la même adresse révoque la précédente, comme `issueOtp` invalide le code
-- précédent. Sans cet index, un formateur qui s'y reprend à trois fois laisse
-- trois liens vivants — donc trois gratuités possibles pour une seule décision.
CREATE UNIQUE INDEX "community_invitations_open_nominative_unique"
ON "community_invitations" ("communityId", "email")
WHERE "kind" = 'NOMINATIVE' AND "revokedAt" IS NULL AND "acceptedAt" IS NULL;

-- Un seul lien partageable ouvert par (communauté, émetteur) : le lien est
-- durable et régénérable, pas une collection. C'est aussi ce qui rend « révoquer
-- et régénérer » lisible côté écran — il n'y a jamais qu'un lien à montrer.
CREATE UNIQUE INDEX "community_invitations_open_share_link_unique"
ON "community_invitations" ("communityId", "issuerId")
WHERE "kind" = 'SHARE_LINK' AND "revokedAt" IS NULL;
