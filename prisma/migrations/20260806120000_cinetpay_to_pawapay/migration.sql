-- CinetPay est remplacé intégralement par PawaPay.
--
-- `RENAME VALUE` plutôt que création d'une valeur + bascule + suppression :
-- l'opération est atomique, ne réécrit aucune ligne et ne demande pas de
-- réécriture des colonnes qui référencent le type.
--
-- Effet sur l'existant : les achats historiquement marqués CINETPAY portent
-- désormais PAWAPAY. C'est sans conséquence pratique — l'initiation CinetPay
-- n'a jamais été implémentée, donc aucun paiement CinetPay réel n'existe. Par
-- précaution, `attemptPawaPayRefund` (src/lib/disputes.ts) refuse d'appeler
-- l'API quand `providerTransactionId` n'est pas un UUID : un ancien
-- identifiant `cp_…` part en tâche de remboursement manuel au lieu d'être
-- envoyé à un fournisseur qui ne le connaît pas.
ALTER TYPE "PaymentProvider" RENAME VALUE 'CINETPAY' TO 'PAWAPAY';

-- Même raison pour l'origine d'un litige : un chargeback venu du circuit
-- mobile money s'appelle désormais du nom de son fournisseur.
ALTER TYPE "DisputeSource" RENAME VALUE 'CINETPAY_DISPUTE' TO 'PAWAPAY_DISPUTE';

-- `manual_refund_tasks.provider` est une colonne TEXTE libre, pas l'énumération :
-- le renommage de type ne l'atteint donc pas. Son défaut littéral et ses lignes
-- existantes se réécrivent à la main, sinon la file de remboursement manuel
-- continuerait d'afficher le nom d'un fournisseur qui n'est plus branché.
ALTER TABLE "manual_refund_tasks" ALTER COLUMN "provider" SET DEFAULT 'PAWAPAY';
UPDATE "manual_refund_tasks" SET "provider" = 'PAWAPAY' WHERE "provider" = 'CINETPAY';
