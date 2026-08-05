-- Le jeton en clair d'un lien de parrainage — et de lui seul.
--
-- La spécification posait « SHA-256 uniquement, le clair n'est jamais stocké ».
-- Cette règle ne survit pas au panneau « Inviter » : un lien partageable est
-- fait pour être recopié, donc pour être **réaffiché**. Haché seul, il faudrait
-- en régénérer un à chaque consultation, ce qui révoquerait à chaque fois le
-- lien déjà partagé — l'inverse de ce qu'on cherche.
--
-- Les deux jetons n'ont pas le même enjeu, et c'est ce qui autorise la
-- différence de traitement :
--   · SHARE_LINK — fuité, il fait adhérer quelqu'un **au tarif plein**. C'est un
--     lien destiné à circuler sur WhatsApp ; le stocker en clair ne retire rien.
--   · NOMINATIVE — fuité, il coûte au formateur les mois offerts de
--     l'arbitrage 75. Il reste haché seul, et cette colonne reste nulle.
--
-- `tokenHash` demeure le chemin de recherche des deux formes : rien ne change
-- côté vérification.

-- AlterTable
ALTER TABLE "community_invitations" ADD COLUMN     "token" TEXT;

-- La règle ci-dessus, tenue en base plutôt que par convention : une route
-- distraite ne peut pas écrire le clair d'un jeton nominatif.
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_clear_token_check" CHECK (
  ("kind" = 'SHARE_LINK' AND "token" IS NOT NULL)
  OR
  ("kind" = 'NOMINATIVE' AND "token" IS NULL)
);
