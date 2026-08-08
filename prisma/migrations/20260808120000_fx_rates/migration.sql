-- Taux de change du FCFA vers les devises d'encaissement.
--
-- Additive : aucune colonne existante n'est touchée, aucune donnée déplacée.
-- Une table vide se comporte exactement comme avant pour la zone franc — XAF et
-- XOF sont à parité fixe et n'ont jamais de ligne ici — et refuse l'encaissement
-- partout ailleurs tant qu'un taux n'a pas été posé. C'est voulu : mieux vaut un
-- pays fermé qu'un pays ouvert à un taux inventé.

CREATE TABLE "fx_rates" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "unitsPerXaf" DECIMAL(18,8) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fx_rates_currency_key" ON "fx_rates"("currency");
