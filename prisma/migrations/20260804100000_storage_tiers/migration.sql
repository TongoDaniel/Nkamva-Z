-- Extension de stockage par paliers de 50 Go — arbitrages 54 et 69.
--
-- Le prix n'est pas dans le code : il rejoint `platform_tariffs`, administré et
-- daté comme celui de l'abonnement (décision 59 — « le tarif est administré,
-- pas déployé »). Tant que le Super-admin n'en a posé aucun, un palier vaut
-- zéro et ne facture rien : l'absence de prix n'invente pas de créance.
CREATE TYPE "TariffKind" AS ENUM ('SUBSCRIPTION', 'STORAGE_TIER');

-- Les tarifs existants sont tous des abonnements : c'est le seul objet que la
-- table connaissait.
ALTER TABLE "platform_tariffs" ADD COLUMN "kind" "TariffKind" NOT NULL DEFAULT 'SUBSCRIPTION';

DROP INDEX IF EXISTS "platform_tariffs_cadence_validFrom_idx";
CREATE INDEX "platform_tariffs_kind_cadence_validFrom_idx"
    ON "platform_tariffs"("kind", "cadence", "validFrom");

-- Paliers détenus par le formateur. Le quota effectif s'en déduit :
--   40 Go (arbitrage 54) + storageTiers × 50 Go (arbitrage 69)
ALTER TABLE "trainer_profiles" ADD COLUMN "storageTiers" INTEGER NOT NULL DEFAULT 0;

-- Arbitrage 69 — « facturées avec l'abonnement ». Le palier n'a donc pas sa
-- propre échéance : il s'ajoute à la période du formateur, à sa cadence.
-- Le montant est figé à l'ouverture comme le reste (décision 57) : réduire ses
-- paliers ne réécrit pas une période déjà ouverte.
ALTER TABLE "subscription_charges" ADD COLUMN "storageTiers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscription_charges" ADD COLUMN "storageFcfa" INTEGER NOT NULL DEFAULT 0;
