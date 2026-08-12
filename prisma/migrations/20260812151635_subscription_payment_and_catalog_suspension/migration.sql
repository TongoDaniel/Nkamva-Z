-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "catalogSuspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "amountFcfa" INTEGER NOT NULL,
    "chargeIds" TEXT[],
    "provider" "PaymentProvider" NOT NULL,
    "providerTransactionId" TEXT,
    "providerStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_providerTransactionId_key" ON "subscription_payments"("providerTransactionId");

-- CreateIndex
CREATE INDEX "subscription_payments_trainerId_providerStatus_idx" ON "subscription_payments"("trainerId", "providerStatus");

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
