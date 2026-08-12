-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "obligationAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "courses_trainerId_obligationAt_idx" ON "courses"("trainerId", "obligationAt");

-- Rétro-remplissage (arbitrage 13). Sans lui, tout ce qui a déjà été vendu
-- resterait compté dans le quota de son formateur et continuerait de lui être
-- facturé : la colonne serait posée, l'arbitrage ne s'appliquerait qu'aux
-- ventes futures, et l'écart serait invisible.
--
-- La date retenue est celle du **premier** achat abouti, pas celle de la
-- migration : c'est ce que le champ signifie, et c'est ce que la révision au
-- renouvellement (arbitrage 19) recalculera à l'identique.
--
-- « Abouti » = `SUCCEEDED` et non remboursé — le même couple que le filtre
-- `SOLD` de `trainer-stats.ts` et `analytics.ts`.
UPDATE "courses" c
SET "obligationAt" = p."firstPaidAt"
FROM (
  SELECT "courseId", MIN("createdAt") AS "firstPaidAt"
  FROM "purchases"
  WHERE "courseId" IS NOT NULL
    AND "providerStatus" = 'SUCCEEDED'
    AND "refundedAt" IS NULL
  GROUP BY "courseId"
) p
WHERE c."id" = p."courseId";
