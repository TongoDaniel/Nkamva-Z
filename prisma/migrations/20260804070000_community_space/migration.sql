-- Espace membre d'une communauté : annonces et fil de discussion.
--
-- Deux salons plutôt qu'un fil unique : `broadcastEnabled` et `forumEnabled`
-- s'activent séparément sur la communauté depuis le Lot 0, et étaient jusqu'ici
-- annoncés publiquement sans que rien ne les serve.
CREATE TYPE "CommunityPostKind" AS ENUM ('ANNOUNCEMENT', 'DISCUSSION');

CREATE TABLE "community_posts" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "CommunityPostKind" NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "repliesCount" INTEGER NOT NULL DEFAULT 0,
    "lastReplyAt" TIMESTAMP(3),
    -- Retrait par l'auteur ou par le formateur. Effacer la ligne casserait le
    -- fil : les réponses resteraient sans question, et la modération perdrait la
    -- trace de ce qu'elle a retiré.
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_post_replies" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_post_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_posts_communityId_kind_createdAt_idx"
    ON "community_posts"("communityId", "kind", "createdAt");
-- Le tri du forum : épinglés d'abord, puis la discussion la plus vivante.
CREATE INDEX "community_posts_communityId_pinned_lastReplyAt_idx"
    ON "community_posts"("communityId", "pinned", "lastReplyAt");
CREATE INDEX "community_post_replies_postId_createdAt_idx"
    ON "community_post_replies"("postId", "createdAt");

-- La communauté supprimée emporte ses salons : ils n'ont aucun sens sans elle.
-- L'auteur, lui, est `RESTRICT` comme partout ailleurs — un compte ne
-- disparaît pas en laissant des messages orphelins, il passe par la purge.
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "community_post_replies" ADD CONSTRAINT "community_post_replies_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_post_replies" ADD CONSTRAINT "community_post_replies_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
