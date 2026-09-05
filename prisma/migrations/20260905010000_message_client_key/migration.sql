-- ===========================================================================
-- Idempotence de l'envoi d'un message (constat 9 de l'audit du 1er septembre)
-- ===========================================================================
-- Le doublon constaté ne venait pas d'un double clic : le bouton se désactive
-- pendant l'envoi. Il venait du délai client de 20 s, qui annule la requête
-- pendant que le serveur, lui, committe. L'écran annonçait alors « votre
-- message n'est pas parti », la personne renvoyait, et le fil portait deux fois
-- la même phrase.
--
-- La clé est tirée par le navigateur **à la frappe**, et rejouée telle quelle à
-- chaque tentative du même message. Le second envoi retombe donc sur la ligne
-- du premier au lieu d'en créer une seconde.
--
-- Index **partiel** : les messages d'avant cette migration, et ceux que le seed
-- ou une migration écrivent sans clé, portent `NULL`. Deux NULL ne se heurtent
-- pas en Postgres, mais autant le dire explicitement plutôt que de compter
-- dessus. Non exprimable dans schema.prisma — même procédé que
-- `conversations_direct_unique`.
-- ===========================================================================

ALTER TABLE "messages" ADD COLUMN "clientKey" TEXT;

CREATE UNIQUE INDEX "messages_client_key_unique"
ON "messages" ("conversationId", "clientKey")
WHERE "clientKey" IS NOT NULL;
