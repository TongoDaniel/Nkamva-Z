-- Factures — numérotation continue et pièces immuables.
CREATE TYPE "InvoiceKind" AS ENUM ('PURCHASE', 'SUBSCRIPTION');

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    -- Figé à l'émission. Rien ici n'est modifiable après coup : une facture se
    -- corrige par un avoir, pas par une réécriture.
    "number" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "subscriptionChargeId" TEXT,
    "label" TEXT NOT NULL,
    "amountFcfa" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- Compteur de numérotation, une ligne par exercice.
--
-- Une séquence Postgres serait plus simple, mais `nextval` avance même quand la
-- transaction échoue : la suite des numéros y prendrait des trous. Une
-- numérotation de facture doit être **continue**. Un `UPDATE ... RETURNING` sur
-- cette ligne verrouille la ligne le temps de la transaction : deux émissions
-- simultanées se sérialisent, et un échec rend le numéro.
CREATE TABLE "invoice_counters" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("year")
);

CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
-- Une pièce par achat et par période : réémettre rend la même facture, il n'en
-- existe jamais deux pour la même chose.
CREATE UNIQUE INDEX "invoices_purchaseId_key" ON "invoices"("purchaseId");
CREATE UNIQUE INDEX "invoices_subscriptionChargeId_key" ON "invoices"("subscriptionChargeId");
CREATE INDEX "invoices_userId_issuedAt_idx" ON "invoices"("userId", "issuedAt");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionChargeId_fkey"
    FOREIGN KEY ("subscriptionChargeId") REFERENCES "subscription_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
