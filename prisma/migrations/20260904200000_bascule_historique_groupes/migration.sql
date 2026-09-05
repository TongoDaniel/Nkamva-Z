-- ===========================================================================
-- Temps 2 de la messagerie unifiée — la bascule de l'historique (arbitrage 126)
-- ===========================================================================
-- Le temps 1 a mis les groupes dans la messagerie et gelé le forum en lecture.
-- Celui-ci y verse ce qui y avait été écrit, puis vide les deux tables.
--
-- **Cette migration est irréversible.** Des réponses aplaties ne se
-- ré-imbriquent pas : l'ordre chronologique ne dit plus qui répondait à qui.
-- C'est le prix assumé du passage d'un forum à un flux, et la raison pour
-- laquelle elle arrive après un temps 1 éprouvé.
--
-- Deux pertes, nommées plutôt que subies :
--
--   · **L'imbrication.** Une réponse devient un message posté à sa propre date.
--     Elle suit donc son billet, mais rien ne dit plus qu'elle lui répondait.
--   · **L'épingle d'une discussion.** Le nouveau modèle n'épingle que les
--     annonces (`Message.announcement`). Une discussion épinglée par un membre
--     ne peut pas devenir une annonce — annoncer est un geste de formateur
--     (arbitrage 128) —, elle perd donc son épingle. Les annonces, elles, la
--     gardent, puisque c'est exactement ce que le marqueur veut dire.
--
-- Ce qui est **conservé** : l'auteur, la date, le texte, et le retrait. Un
-- billet retiré arrive retiré, avec la trace de qui l'a retiré.
-- ===========================================================================

-- --- 1. Un groupe pour chaque communauté qui a quelque chose à recevoir ------
-- Le temps 1 crée les groupes paresseusement, à la première visite. Une
-- communauté dont personne n'a encore ouvert la messagerie n'en a donc pas, et
-- ses billets n'auraient eu nulle part où aller.
INSERT INTO conversations (id, kind, "communityId", "learnerId", "trainerId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'GROUP', c.id, NULL, c."trainerId", now(), now()
FROM communities c
WHERE EXISTS (SELECT 1 FROM community_posts p WHERE p."communityId" = c.id)
  AND NOT EXISTS (
    SELECT 1 FROM conversations g WHERE g."communityId" = c.id AND g.kind = 'GROUP'
  );

-- --- 2. La correspondance billet → message, **avant** d'écrire quoi que ce soit
-- L'identifiant du futur message est tiré ici, pas au moment de l'insertion.
-- Le reconstituer après coup aurait supposé de rejoindre les messages sur
-- (auteur, date) — un rattachement qui se trompe le jour où deux billets du
-- même auteur portent la même date à la microseconde. Une migration ne se
-- permet pas un « probablement unique ».
--
-- Table réelle et non temporaire : elle reste lisible si la migration échoue en
-- cours de route. Elle est supprimée à la fin.
CREATE TABLE _bascule_correspondance (
  source_kind     text NOT NULL,
  source_id       text NOT NULL,
  message_id      text NOT NULL DEFAULT gen_random_uuid()::text,
  conversation_id text NOT NULL,
  sender_id       text NOT NULL,
  body            text NOT NULL,
  announcement    boolean NOT NULL,
  deleted_at      timestamp(3),
  deleted_by      text,
  created_at      timestamp(3) NOT NULL,
  PRIMARY KEY (source_kind, source_id)
);

INSERT INTO _bascule_correspondance
  (source_kind, source_id, conversation_id, sender_id, body, announcement, deleted_at, deleted_by, created_at)
SELECT 'POST', p.id, g.id, p."authorId", p.body, (p.kind = 'ANNOUNCEMENT'),
       p."deletedAt", p."deletedById", p."createdAt"
FROM community_posts p
JOIN conversations g ON g."communityId" = p."communityId" AND g.kind = 'GROUP';

-- Une réponse devient un message posté à sa propre date. Elle suit donc son
-- billet — c'est tout ce que le nouveau modèle sait dire d'elle.
INSERT INTO _bascule_correspondance
  (source_kind, source_id, conversation_id, sender_id, body, announcement, deleted_at, deleted_by, created_at)
SELECT 'REPLY', r.id, g.id, r."authorId", r.body, false,
       r."deletedAt", r."deletedById", r."createdAt"
FROM community_post_replies r
JOIN community_posts p ON p.id = r."postId"
JOIN conversations g ON g."communityId" = p."communityId" AND g.kind = 'GROUP';

-- --- 3. Les messages, en une seule écriture ---------------------------------
INSERT INTO messages (id, "conversationId", "senderId", body, announcement, "readAt", "deletedAt", "deletedById", "createdAt")
SELECT message_id, conversation_id, sender_id, body, announcement, NULL, deleted_at, deleted_by, created_at
FROM _bascule_correspondance;

-- --- 5. Les signalements suivent leur cible ---------------------------------
-- `targetId` n'est pas une clé étrangère (les cibles vivent dans des tables
-- différentes), donc rien n'aurait signalé la rupture : un signalement ouvert
-- serait resté à pointer une ligne effacée, et la Modération aurait lu
-- « cible introuvable » sur un dossier qu'elle doit instruire.
UPDATE reports r
SET "targetType" = 'MESSAGE', "targetId" = c.message_id
FROM _bascule_correspondance c
WHERE r."targetType" = 'COMMUNITY_POST' AND c.source_kind = 'POST' AND c.source_id = r."targetId";

UPDATE reports r
SET "targetType" = 'MESSAGE', "targetId" = c.message_id
FROM _bascule_correspondance c
WHERE r."targetType" = 'COMMUNITY_POST_REPLY' AND c.source_kind = 'REPLY' AND c.source_id = r."targetId";

-- --- 6. La conversation porte la date de son dernier message -----------------
-- C'est elle qui ordonne la liste : sans cette reprise, un groupe rempli
-- d'archives serait apparu tout en bas, comme s'il n'y avait jamais rien eu.
UPDATE conversations g
SET "lastMessageAt" = sous.dernier
FROM (
  SELECT "conversationId", max("createdAt") AS dernier FROM messages GROUP BY "conversationId"
) sous
WHERE g.id = sous."conversationId" AND g.kind = 'GROUP';

-- --- 7. Vider le forum, garder les tables ------------------------------------
-- Les tables restent : les énumérations de signalement `COMMUNITY_POST` et
-- `COMMUNITY_POST_REPLY` gardent un sens historique, et supprimer une table
-- pour économiser deux définitions vides n'achète rien.
DELETE FROM community_post_replies;
DELETE FROM community_posts;

DROP TABLE _bascule_correspondance;

-- --- 8. L'interrupteur des annonces n'a plus d'objet -------------------------
-- Annoncer est devenu un geste dans le groupe (arbitrage 128) : il n'y a plus
-- de salon d'annonces à ouvrir ou fermer.
ALTER TABLE "communities" DROP COLUMN "broadcastEnabled";
