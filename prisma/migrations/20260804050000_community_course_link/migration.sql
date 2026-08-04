-- Ressources incluses dans une communauté (arbitrages 45, 47, 48).

-- Arbitrage 47 — circuits exclusifs. Une ressource est soit vendue à l'unité,
-- soit incluse dans une communauté ; son prix n'a plus d'objet dans le second
-- cas.
CREATE TYPE "CourseCircuit" AS ENUM ('MARKETPLACE', 'COMMUNITY');
ALTER TABLE "courses" ADD COLUMN "circuit" "CourseCircuit" NOT NULL DEFAULT 'MARKETPLACE';

-- La liaison est bornée, jamais supprimée : délier retire la ressource aux
-- futurs membres mais laisse son accès à qui l'avait pendant la liaison
-- (arbitrage 48). Effacer la ligne effacerait ce droit acquis.
CREATE TABLE "community_courses" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),

    CONSTRAINT "community_courses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_courses_communityId_unlinkedAt_idx" ON "community_courses"("communityId", "unlinkedAt");
CREATE INDEX "community_courses_courseId_unlinkedAt_idx" ON "community_courses"("courseId", "unlinkedAt");

-- Une seule liaison vivante par couple : l'historique peut en contenir
-- plusieurs, le présent une seule.
CREATE UNIQUE INDEX "community_courses_active_unique"
ON "community_courses" ("communityId", "courseId")
WHERE "unlinkedAt" IS NULL;

ALTER TABLE "community_courses" ADD CONSTRAINT "community_courses_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_courses" ADD CONSTRAINT "community_courses_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
