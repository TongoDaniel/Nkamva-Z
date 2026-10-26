-- Échéances d'adhésion ouvertes par le renouvellement avec un identifiant de
-- transaction inventé (`cp_<uuid>` pour PawaPay, `pi_<uuid>` pour Stripe), qui
-- n'a jamais été envoyé au fournisseur (campagne du 12 octobre 2026, B1).
-- Elles bloquaient le règlement : la reprise les rendait « telles quelles » et
-- rien n'arrivait sur le téléphone de l'apprenant.
--
-- On les ramène à ce qu'elles sont : une échéance sans transaction, marquée
-- comme venant du renouvellement, que le prochain clic « Régler » ouvrira chez
-- le fournisseur choisi.
--
-- Le motif ne peut viser qu'elles : un vrai dépôt PawaPay est un UUID nu, une
-- vraie session Stripe commence par `cs_`, une vraie intention `pi_` n'a jamais
-- la forme d'un UUID à tirets.
UPDATE "purchases"
SET "providerTransactionId" = NULL,
    "acquisitionSource" = 'RENEWAL'
WHERE "providerStatus" = 'PENDING'
  AND "communityId" IS NOT NULL
  AND "providerTransactionId" ~ '^(cp|pi)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
