-- Audit des cas limites du 28 octobre 2026.

-- A3 — reliquat abandonné à l'effacement d'un compte formateur.
ALTER TYPE "WalletDebitReason" ADD VALUE 'CLOSING_RESIDUE';

-- A6 — date du dernier changement de prix d'une communauté.
ALTER TABLE "communities" ADD COLUMN "priceChangedAt" TIMESTAMP(3);
