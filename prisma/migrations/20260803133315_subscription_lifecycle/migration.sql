-- CreateEnum
CREATE TYPE "SubscriptionChargeStatus" AS ENUM ('DUE', 'SETTLED', 'WAIVED');

-- AlterTable
ALTER TABLE "trainer_profiles" ADD COLUMN     "subscriptionPastDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "subscription_charges" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "cadence" "PlanCadence" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "listPriceFcfa" INTEGER NOT NULL,
    "discountFcfa" INTEGER NOT NULL DEFAULT 0,
    "discountLabel" TEXT,
    "amountDueFcfa" INTEGER NOT NULL,
    "status" "SubscriptionChargeStatus" NOT NULL DEFAULT 'DUE',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_charges_status_periodEnd_idx" ON "subscription_charges"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_charges_trainerId_periodStart_key" ON "subscription_charges"("trainerId", "periodStart");

-- AddForeignKey
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

