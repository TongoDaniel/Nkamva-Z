-- Arbitrage 63 — deux sanctions distinctes, pas un booléen.
--
-- `suspendedAt` existait mais ne disait pas laquelle : une suspension douce et
-- une exclusion totale étaient indiscernables à la relecture. C'est ce qui
-- laissait /admin/utilisateurs sans aucune action.
CREATE TYPE "SanctionLevel" AS ENUM ('NONE', 'RESTRICTED', 'BANNED');

ALTER TABLE "users" ADD COLUMN "sanctionLevel" "SanctionLevel" NOT NULL DEFAULT 'NONE';
ALTER TABLE "users" ADD COLUMN "sanctionReason" TEXT;
ALTER TABLE "users" ADD COLUMN "sanctionedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "sanctionedById" TEXT;

-- Les comptes déjà suspendus le sont au sens fort : c'est le seul état que le
-- code connaissait, et il coupait la connexion.
UPDATE "users" SET "sanctionLevel" = 'BANNED', "sanctionedAt" = "suspendedAt"
WHERE "suspendedAt" IS NOT NULL;
