-- CreateEnum
CREATE TYPE "PlanCadence" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('COURSE', 'USER', 'COMMUNITY', 'MESSAGE', 'DISPUTE_MESSAGE');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('ILLEGAL', 'MISLEADING', 'HARASSMENT', 'SPAM', 'INTELLECTUAL_PROPERTY', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UPHELD', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('CAMPAIGN', 'TRAINER', 'PROMO_CODE');

-- DropIndex
DROP INDEX "trainer_profiles_plan_idx";

-- AlterTable
ALTER TABLE "trainer_profiles" DROP COLUMN "plan",
ADD COLUMN     "pendingCadence" "PlanCadence",
ADD COLUMN     "subscriptionCadence" "PlanCadence" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "subscriptionDiscountFcfa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subscriptionPriceFcfa" INTEGER;

-- DropEnum
DROP TYPE "TrainerPlan";

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "detail" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "decisionNote" TEXT,
    "targetHidden" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_tariffs" (
    "id" TEXT NOT NULL,
    "cadence" "PlanCadence" NOT NULL,
    "amountFcfa" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "label" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_discounts" (
    "id" TEXT NOT NULL,
    "kind" "DiscountKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amountFcfa" INTEGER NOT NULL,
    "code" TEXT,
    "trainerId" TEXT,
    "reason" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "reports_reporterId_idx" ON "reports"("reporterId");

-- CreateIndex
CREATE INDEX "platform_tariffs_cadence_validFrom_idx" ON "platform_tariffs"("cadence", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "platform_discounts_code_key" ON "platform_discounts"("code");

-- CreateIndex
CREATE INDEX "platform_discounts_kind_validFrom_idx" ON "platform_discounts"("kind", "validFrom");

-- CreateIndex
CREATE INDEX "platform_discounts_trainerId_idx" ON "platform_discounts"("trainerId");

-- CreateIndex
CREATE INDEX "trainer_profiles_subscriptionCadence_idx" ON "trainer_profiles"("subscriptionCadence");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

