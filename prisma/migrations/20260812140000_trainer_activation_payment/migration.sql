-- Règlement du premier abonnement, exigé avant que le TrainerProfile existe.
-- Rattaché à la candidature et non au profil : c'est tout l'objet de l'étape.
CREATE TABLE "trainer_activation_payments" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "cadence" "PlanCadence" NOT NULL,
    "listPriceFcfa" INTEGER NOT NULL,
    "discountFcfa" INTEGER NOT NULL DEFAULT 0,
    "discountLabel" TEXT,
    "amountFcfa" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerTransactionId" TEXT,
    "providerStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_activation_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trainer_activation_payments_providerTransactionId_key"
    ON "trainer_activation_payments"("providerTransactionId");

CREATE INDEX "trainer_activation_payments_applicationId_providerStatus_idx"
    ON "trainer_activation_payments"("applicationId", "providerStatus");

ALTER TABLE "trainer_activation_payments"
    ADD CONSTRAINT "trainer_activation_payments_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "trainer_applications"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
