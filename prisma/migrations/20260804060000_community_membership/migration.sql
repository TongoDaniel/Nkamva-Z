-- Adhésion payante aux communautés — un seul paiement en attente à la fois.
--
-- `initiateMembershipPayment` contrôle déjà l'échéance ouverte, mais en lecture
-- puis écriture hors transaction : deux onglets, ou un double clic, lisaient
-- tous deux « aucun paiement en cours » avant d'insérer. L'apprenant se
-- retrouvait avec deux achats pour le même mois — et le second, confirmé après
-- le premier, prolongeait l'adhésion d'une période qu'il n'avait pas voulue.
--
-- Non exprimable dans schema.prisma (pas d'index unique partiel côté Prisma),
-- appliqué en SQL brut — même procédé que `purchases_active_course_unique` et
-- `community_subscriptions_active_unique`.
--
-- Le filtre ne retient que PENDING, à la différence de l'index des ressources :
-- une adhésion est **récurrente**, chaque mois réglé laisse un achat SUCCEEDED
-- de plus sur le même couple (apprenant, communauté). Les inclure interdirait
-- le deuxième mois.
CREATE UNIQUE INDEX "purchases_pending_community_unique"
ON "purchases" ("learnerId", "communityId")
WHERE "communityId" IS NOT NULL AND "providerStatus" = 'PENDING';
