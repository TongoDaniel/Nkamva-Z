-- Modèle v1.1 et plan d'action, phases 1 et 2 : plans Community, suivi des
-- formateurs (service client, commercial), signal Pro, archivage pour
-- inactivité.

-- Plans Community (en vigueur au 1er mars 2027).
CREATE TYPE "CommunityPlan" AS ENUM ('DECOUVERTE', 'ESSENTIEL', 'CROISSANCE', 'PREMIUM');
ALTER TABLE "communities" ADD COLUMN "maxPlan" "CommunityPlan",
ADD COLUMN "plan" "CommunityPlan" NOT NULL DEFAULT 'DECOUVERTE',
ADD COLUMN "planUnpaidAt" TIMESTAMP(3);
ALTER TABLE "subscription_charges" ADD COLUMN "communityPlans" JSONB,
ADD COLUMN "communityPlansFcfa" INTEGER NOT NULL DEFAULT 0;

-- Signal Pro et archivage pour inactivité.
ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "trainer_profiles" ADD COLUMN "inactivityArchivedAt" TIMESTAMP(3),
ADD COLUMN "inactivityNoticeAt" TIMESTAMP(3),
ADD COLUMN "proSignalAt" TIMESTAMP(3);
ALTER TABLE "courses" ADD COLUMN "inactivityArchivedAt" TIMESTAMP(3);

-- Suivi des formateurs par l'équipe.
CREATE TYPE "TrainerNoteKind" AS ENUM ('SUPPORT_CONTACT', 'SALES_NOTE');
CREATE TABLE "trainer_notes" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "TrainerNoteKind" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "trainer_notes_trainerId_createdAt_idx" ON "trainer_notes"("trainerId", "createdAt");
CREATE INDEX "trainer_notes_kind_createdAt_idx" ON "trainer_notes"("kind", "createdAt");
ALTER TABLE "trainer_notes" ADD CONSTRAINT "trainer_notes_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Marketing payant, par mois (plan d'action 3.2).
CREATE TABLE "marketing_spend" (
    "month" TEXT NOT NULL,
    "amountFcfa" INTEGER NOT NULL,
    "note" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_spend_pkey" PRIMARY KEY ("month")
);
