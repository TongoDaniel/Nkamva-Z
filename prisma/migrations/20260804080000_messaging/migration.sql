-- Messagerie 1 à 1 — arbitrages 33 et 39.
--
-- Le fil se rattache à l'adhésion, jamais à l'achat : d'où `communityId`, et
-- d'où l'unicité `(communityId, learnerId)` — une communauté n'a qu'un
-- formateur, un membre n'y a donc qu'un seul fil.
--
-- Le fil survit à l'adhésion (arbitrage 39) : quand elle s'arrête, l'écriture
-- cesse mais l'historique reste lisible. Aucune contrainte ne le rattache à la
-- souscription, qui elle peut se fermer.
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- Un seul fil par membre et par communauté. Contrainte totale, pas partielle :
-- rouvrir une conversation après un retour dans la communauté doit retrouver
-- l'historique, pas en ouvrir un second à côté (arbitrage 39).
CREATE UNIQUE INDEX "conversations_communityId_learnerId_key"
    ON "conversations"("communityId", "learnerId");
CREATE INDEX "conversations_learnerId_lastMessageAt_idx"
    ON "conversations"("learnerId", "lastMessageAt");
CREATE INDEX "conversations_trainerId_lastMessageAt_idx"
    ON "conversations"("trainerId", "lastMessageAt");
CREATE INDEX "messages_conversationId_createdAt_idx"
    ON "messages"("conversationId", "createdAt");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_learnerId_fkey"
    FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_trainerId_fkey"
    FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
