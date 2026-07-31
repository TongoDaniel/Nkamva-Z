-- Lot 0 §2.6 : un apprenant ne peut avoir qu'un seul abonnement actif (ou banni)
-- par communauté à un instant donné. Non exprimable dans schema.prisma (pas
-- d'index unique partiel côté Prisma), appliqué en SQL brut.
CREATE UNIQUE INDEX "community_subscriptions_active_unique"
ON "community_subscriptions" ("communityId", "learnerId")
WHERE "status" IN ('ACTIVE', 'PAST_DUE', 'BANNED');
