-- Retrait de Wave des opérateurs mobile money.
--
-- Wave n'est pas distribué par PawaPay : il n'apparaît nulle part dans
-- `/v2/active-conf`. Un moyen de versement Wave ne pouvait donc jamais être
-- servi automatiquement — il partait systématiquement en traitement manuel,
-- sans que le formateur qui l'avait enregistré en soit averti.
--
-- ⚠️ Cette migration touche des données. Elle **archive** les moyens de
-- versement concernés au lieu de les supprimer : un moyen de versement porte
-- des pièces justificatives, un historique de revue et, potentiellement, des
-- versements passés qui le référencent. Le formateur devra en enregistrer un
-- nouveau ; c'est exactement ce qu'il aurait dû faire de toute façon.

-- 1. Neutraliser les lignes avant de toucher au type : une valeur d'énumération
--    ne peut pas disparaître tant qu'une ligne la porte.
UPDATE "payout_methods"
   SET "mobileOperator" = NULL,
       "isActive" = false,
       "archivedAt" = COALESCE("archivedAt", NOW())
 WHERE "mobileOperator" = 'WAVE';

-- 2. PostgreSQL ne sait pas retirer une valeur d'un type énuméré : il faut le
--    recréer et rebrancher la colonne dessus.
ALTER TYPE "MobileMoneyOperator" RENAME TO "MobileMoneyOperator_old";

CREATE TYPE "MobileMoneyOperator" AS ENUM ('ORANGE_MONEY', 'MTN_MOMO', 'AIRTEL_MONEY', 'M_PESA');

ALTER TABLE "payout_methods"
  ALTER COLUMN "mobileOperator" TYPE "MobileMoneyOperator"
  USING ("mobileOperator"::text::"MobileMoneyOperator");

DROP TYPE "MobileMoneyOperator_old";
