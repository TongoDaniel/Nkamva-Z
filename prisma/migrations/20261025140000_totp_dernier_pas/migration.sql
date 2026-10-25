-- Un code TOTP ne sert qu'une fois (campagne du 12 octobre 2026, M8).
-- Le dernier pas de temps accepté est mémorisé par compte ; un code de même pas
-- ou plus ancien est refusé. Nul pour les comptes existants : leur prochain
-- code valide est accepté, puis la règle s'applique.
ALTER TABLE "users" ADD COLUMN "twoFactorLastStep" INTEGER;
