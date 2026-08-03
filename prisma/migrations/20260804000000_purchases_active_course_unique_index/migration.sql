-- Lot 4 — un apprenant ne peut avoir qu'un seul achat vivant par ressource.
--
-- `initiatePurchase` contrôlait déjà l'achat existant, mais en lecture puis
-- écriture hors transaction : deux requêtes simultanées lisaient toutes deux
-- « aucun achat » avant d'insérer. Reproduit 2 fois sur 6 en test de charge —
-- deux achats créés, et le portefeuille du formateur crédité deux fois, chaque
-- crédit portant son propre providerTransactionId donc échappant à
-- l'idempotence de `creditWalletOnPurchase`.
--
-- Non exprimable dans schema.prisma (pas d'index unique partiel côté Prisma),
-- appliqué en SQL brut — même procédé que
-- `community_subscriptions_active_unique`.
--
-- Le filtre reprend exactement celui de `initiatePurchase` : seuls les achats
-- FAILED et REFUSED sortent de l'index. Un achat remboursé garde
-- `providerStatus = SUCCEEDED` (le paiement, lui, a bien abouti) et reste donc
-- couvert — comme le contrôle applicatif, qui refuse déjà un rachat après
-- remboursement. L'index ne change aucun comportement, il le rend infalsifiable.
CREATE UNIQUE INDEX "purchases_active_course_unique"
ON "purchases" ("learnerId", "courseId")
WHERE "courseId" IS NOT NULL AND "providerStatus" IN ('PENDING', 'SUCCEEDED');
