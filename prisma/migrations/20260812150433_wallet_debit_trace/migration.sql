-- CreateEnum
CREATE TYPE "WalletDebitReason" AS ENUM ('SUBSCRIPTION_RENEWAL', 'SUBSCRIPTION_ARREARS');

-- CreateTable
CREATE TABLE "wallet_debits" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "amountFcfa" INTEGER NOT NULL,
    "reason" "WalletDebitReason" NOT NULL,
    "subscriptionChargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_debits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_debits_subscriptionChargeId_key" ON "wallet_debits"("subscriptionChargeId");

-- CreateIndex
CREATE INDEX "wallet_debits_trainerId_createdAt_idx" ON "wallet_debits"("trainerId", "createdAt");

-- AddForeignKey
ALTER TABLE "wallet_debits" ADD CONSTRAINT "wallet_debits_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_debits" ADD CONSTRAINT "wallet_debits_subscriptionChargeId_fkey" FOREIGN KEY ("subscriptionChargeId") REFERENCES "subscription_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
