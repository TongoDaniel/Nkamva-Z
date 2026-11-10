-- Modèle v1.1 et plan d'action : plans Marketplace, rôles cumulables,
-- séparation des tâches, plafond des lives.

-- Plans Marketplace : « Vous ne payez que quand vous vendez » et Pro.
CREATE TYPE "TrainerPlan" AS ENUM ('BASE', 'PRO');
ALTER TYPE "TariffKind" ADD VALUE 'PRO_SUBSCRIPTION';
ALTER TABLE "trainer_profiles" ADD COLUMN "plan" "TrainerPlan" NOT NULL DEFAULT 'BASE',
ADD COLUMN "pendingPlan" "TrainerPlan",
ADD COLUMN "founder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subscription_charges" ADD COLUMN "plan" "TrainerPlan" NOT NULL DEFAULT 'BASE';

-- Rôles d'administration cumulables (plan d'action, section 2).
ALTER TYPE "AdminRole" ADD VALUE 'PILOTAGE';
ALTER TYPE "AdminRole" ADD VALUE 'SUPPORT';
ALTER TYPE "AdminRole" ADD VALUE 'SALES';
ALTER TYPE "AdminRole" ADD VALUE 'COMMUNICATION';
ALTER TYPE "AdminRole" ADD VALUE 'TECHNICAL';
ALTER TYPE "AdminRole" ADD VALUE 'QA';
ALTER TABLE "users" ADD COLUMN "adminRoles" "AdminRole"[] DEFAULT ARRAY[]::"AdminRole"[];
-- Chaque administrateur garde exactement ses droits : son rôle unique devient
-- le premier de sa liste.
UPDATE "users" SET "adminRoles" = ARRAY["adminRole"] WHERE "adminRole" IS NOT NULL;

-- Séparation des tâches : proposition du service client, double validation.
ALTER TABLE "disputes" ADD COLUMN "proposedResolution" "DisputeResolution",
ADD COLUMN "proposedRefundFcfa" INTEGER,
ADD COLUMN "proposedFaultParty" "RefundFault",
ADD COLUMN "proposedNote" TEXT,
ADD COLUMN "proposedById" TEXT,
ADD COLUMN "proposedAt" TIMESTAMP(3);
ALTER TABLE "payouts" ADD COLUMN "firstApprovedById" TEXT,
ADD COLUMN "firstApprovedAt" TIMESTAMP(3);

-- Plafond mensuel des lives : une séance lancée au-delà part en audio.
ALTER TABLE "live_sessions" ADD COLUMN "audioOnly" BOOLEAN NOT NULL DEFAULT false;
