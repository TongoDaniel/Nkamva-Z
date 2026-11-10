-- Modèle économique v1.1 (22 octobre 2026) : commission à 10 %, frais de
-- paiement payés par l'acheteur, règle de remboursement par faute.

-- Commission : 10 % sur le plan « Vous ne payez que quand vous vendez ».
-- Les achats déjà conclus gardent le taux figé à la vente (décision 11) ; seuls
-- les formateurs et communautés encore au taux de 15 % passent à 10 %. Un taux
-- négocié à part (ni 15 %, ni 10 %) n'est pas touché.
ALTER TABLE "trainer_profiles" ALTER COLUMN "commissionRate" SET DEFAULT 0.1;
ALTER TABLE "communities" ALTER COLUMN "commissionRate" SET DEFAULT 0.1;
UPDATE "trainer_profiles" SET "commissionRate" = 0.1 WHERE "commissionRate" = 0.15;
UPDATE "communities" SET "commissionRate" = 0.1 WHERE "commissionRate" = 0.15;

-- Frais de paiement : ajoutés au prix, payés par l'acheteur, gardés à part.
ALTER TABLE "purchases" ADD COLUMN "buyerFeeFcfa" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "feeFcfa" INTEGER NOT NULL DEFAULT 0;

-- Remboursement : motifs, faute, examen manuel des abus.
ALTER TYPE "DisputeReason" ADD VALUE 'LIVE_CANCELED';
ALTER TYPE "DisputeReason" ADD VALUE 'CHANGE_OF_MIND';
CREATE TYPE "RefundFault" AS ENUM ('TECHNICAL', 'TRAINER', 'BUYER');
ALTER TABLE "disputes" ADD COLUMN "faultParty" "RefundFault",
ADD COLUMN "abuseReview" BOOLEAN NOT NULL DEFAULT false;

-- Frais non récupérables retenus au formateur fautif.
ALTER TYPE "WalletDebitReason" ADD VALUE 'REFUND_FEES';
ALTER TABLE "wallet_debits" ADD COLUMN "disputeId" TEXT;
CREATE UNIQUE INDEX "wallet_debits_disputeId_key" ON "wallet_debits"("disputeId");
