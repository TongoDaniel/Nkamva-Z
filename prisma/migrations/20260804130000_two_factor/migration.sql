-- Double authentification par application (TOTP).
--
-- Le SMS a été écarté comme second facteur : la plateforme porte des
-- portefeuilles et des retraits, et l'échange de carte SIM est l'attaque qui
-- vise précisément les comptes adossés au mobile money. Le SMS reste le bon
-- canal pour **alerter** (arbitrage 24), pas pour authentifier.
ALTER TABLE "users" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);

-- Codes de secours à usage unique. Hachés en SHA-256 et non en Argon2 : un code
-- tiré sur 80 bits n'a pas la faible entropie d'un mot de passe qu'un hachage
-- lent doit compenser, et vérifier dix Argon2 à chaque tentative coûterait une
-- seconde de calcul pour aucun gain de sécurité.
CREATE TABLE "recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recovery_codes_userId_usedAt_idx" ON "recovery_codes"("userId", "usedAt");

ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
