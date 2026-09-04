-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('DIRECT', 'GROUP');

-- DropIndex
DROP INDEX "conversations_communityId_learnerId_key";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "kind" "ConversationKind" NOT NULL DEFAULT 'DIRECT',
ALTER COLUMN "learnerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "announcement" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "conversation_reads" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "pinnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_reads_userId_pinnedAt_idx" ON "conversation_reads"("userId", "pinnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_reads_conversationId_userId_key" ON "conversation_reads"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "conversations_communityId_kind_idx" ON "conversations"("communityId", "kind");

-- AddForeignKey
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Arbitrage 126 — l'unicité, désormais en deux règles partielles.
--
-- `conversations_communityId_learnerId_key` couvrait toute la table. Il ne peut
-- plus : `learnerId` est nul sur un groupe, et Postgres ne fait pas se heurter
-- deux NULL — l'index aurait donc laissé naître autant de groupes qu'on voulait
-- pour la même communauté, tout en continuant de garantir le direct.
--
-- Deux index partiels plutôt qu'un, parce que ce sont deux règles distinctes :
-- un membre n'a qu'un fil privé par communauté, et une communauté n'a qu'un
-- groupe. Non exprimables dans schema.prisma (pas d'index unique partiel côté
-- Prisma), donc en SQL brut — même procédé que
-- `purchases_active_course_unique` et `community_subscriptions_active_unique`.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "conversations_direct_unique"
ON "conversations" ("communityId", "learnerId")
WHERE "kind" = 'DIRECT' AND "learnerId" IS NOT NULL;

CREATE UNIQUE INDEX "conversations_group_unique"
ON "conversations" ("communityId")
WHERE "kind" = 'GROUP';

-- Un direct sans apprenant, ou un groupe avec, n'a aucun sens : la contrainte
-- le dit en base plutôt que de compter sur les seuls appelants.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_learner_matches_kind"
CHECK (
  ("kind" = 'DIRECT' AND "learnerId" IS NOT NULL)
  OR ("kind" = 'GROUP' AND "learnerId" IS NULL)
);

-- On n'annonce rien à une seule personne (arbitrage 128), mais la règle **ne
-- peut pas** être une contrainte : un CHECK ne voit que sa propre ligne, et
-- savoir si la conversation est un groupe demande de lire une autre table.
-- Postgres refuse la sous-requête. Un déclencheur le pourrait ; il coûterait
-- une lecture à chaque message écrit pour une règle qu'un seul appelant peut
-- enfreindre. Elle reste donc applicative, dans `sendMessage`, et testée.
