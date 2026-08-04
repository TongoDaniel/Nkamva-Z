-- Favoris — une ligne par mise de côté, ciblant une ressource OU une communauté.

CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "communityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- Exactement une cible. Sans cette contrainte, une ligne sans cible — ou avec
-- les deux — passerait la validation Prisma et resterait invisible jusqu'au
-- rendu, où elle produirait une carte vide.
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_one_target"
CHECK (("courseId" IS NOT NULL AND "communityId" IS NULL)
    OR ("courseId" IS NULL AND "communityId" IS NOT NULL));

-- Deux NULL ne se heurtent pas en Postgres : ces index empêchent le doublon sur
-- une cible réelle sans limiter le nombre de favoris de l'autre type.
CREATE UNIQUE INDEX "favorites_userId_courseId_key" ON "favorites"("userId", "courseId");
CREATE UNIQUE INDEX "favorites_userId_communityId_key" ON "favorites"("userId", "communityId");
CREATE INDEX "favorites_userId_createdAt_idx" ON "favorites"("userId", "createdAt");

ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
