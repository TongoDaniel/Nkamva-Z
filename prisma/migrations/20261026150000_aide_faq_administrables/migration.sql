-- Aide & FAQ administrables (26 octobre 2026).
--
-- Le centre d'aide et la FAQ de l'accueil étaient écrits en dur dans le code.
-- Ces deux tables les portent désormais ; l'écran /admin/aide les édite
-- (Super-admin et Modération). Le contenu en vigueur est repris ci-dessous à
-- l'identique, les chiffres remplacés par leurs marqueurs (`{commission}`,
-- `{delai_contestation}`…), que le rendu substitue par les valeurs réelles.
-- Les quatre questions de l'ancienne FAQ d'accueil sont cochées « accueil ».

CREATE TABLE "help_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "help_articles" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "onHomepage" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "help_categories_slug_key" ON "help_categories"("slug");
CREATE INDEX "help_categories_position_idx" ON "help_categories"("position");
CREATE INDEX "help_articles_categoryId_position_idx" ON "help_articles"("categoryId", "position");

ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "help_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Contenu en vigueur.

INSERT INTO "help_categories" ("id", "slug", "title", "hint", "icon", "position", "updatedAt") VALUES ('aide-demarrer', 'demarrer', 'Démarrer', 'Créer un compte, premiers pas', 'play', 0, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-demarrer', 'Comment créer un compte sur NKAMVA ?', 'Cliquez sur « S''inscrire », renseignez votre email et un mot de passe. Un code à six chiffres vous est envoyé pour vérifier l''adresse. La création d''un compte apprenant est gratuite et immédiate : aucun abonnement plateforme n''est requis.', 0, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-demarrer', 'NKAMVA est-il gratuit ?', 'Oui pour les apprenants : le compte ne coûte rien et vous ne payez que les ressources que vous achetez à l''unité. Côté formateur, NKAMVA retient {commission} sur chaque vente. {abonnement_formateur}', 1, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-demarrer', 'Faut-il un ordinateur pour suivre une ressource ?', 'Non. Le site est pensé pour le mobile d''abord : la lecture, la progression et vos achats vous suivent d''un appareil à l''autre dès que vous êtes connecté au même compte.', 2, false, CURRENT_TIMESTAMP);

INSERT INTO "help_categories" ("id", "slug", "title", "hint", "icon", "position", "updatedAt") VALUES ('aide-paiements', 'paiements', 'Paiements', 'Mobile money, FCFA, remboursements', 'credit-card', 1, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-paiements', 'Quels moyens de paiement acceptez-vous ?', 'Le mobile money ({operateurs}) et la carte bancaire. NKAMVA encaisse aujourd''hui depuis {pays}. Les opérateurs proposés dépendent de votre pays : la liste exacte s''affiche à l''écran de paiement, et seuls y figurent ceux qui peuvent réellement encaisser. Les prix sont affichés en FCFA et vous payez le montant exact indiqué sur la fiche.', 0, true, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-paiements', 'Le paiement mobile money est-il sécurisé ?', 'Oui. Les transactions passent par un prestataire de paiement certifié ; NKAMVA ne voit ni ne conserve jamais votre code secret mobile money.', 1, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-paiements', 'Mon paiement est « en attente », que faire ?', 'En mobile money, la confirmation de l''opérateur prend parfois quelques minutes. L''écran de confirmation se met à jour tout seul, et la ressource apparaît dans votre espace dès que le paiement est validé. Vous pouvez fermer la page sans risque : rien n''est perdu.', 2, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-paiements', 'Combien de temps ai-je accès à une ressource achetée ?', 'À vie. Une ressource achetée reste dans « Mes ressources », avec votre progression, sur mobile comme sur ordinateur.', 3, true, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-paiements', 'Puis-je être remboursé ?', 'Dans les {delai_contestation} suivant l''achat, si vous avez consulté moins de {seuil_consommation} de la ressource. Une ressource téléchargeable qui a été téléchargée ne peut plus être remboursée : le fichier est chez vous. La procédure est décrite dans les [conditions d''utilisation](/legal/conditions).', 4, true, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-paiements', 'Comment contester un achat ?', 'Depuis « Mes achats », le bouton « Contester » sur la ligne concernée. L''écran vous dit immédiatement si l''achat ouvre droit à remboursement, avant même que vous ne rédigiez quoi que ce soit.', 5, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-paiements', 'Que se passe-t-il pendant l''examen d''une contestation ?', 'Votre accès à la ressource est suspendu le temps de l''instruction, et la part correspondante du formateur est gelée. Si la contestation n''est pas retenue, l''accès vous est rendu.', 6, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-paiements', 'Combien de temps une contestation prend-elle ?', 'L''équipe examine les dossiers dans leur ordre d''arrivée. Si une précision vous est demandée, vous disposez de {delai_reponse_apprenant} pour répondre ; sans réponse, le dossier se clôt et votre accès est rétabli.', 7, false, CURRENT_TIMESTAMP);

INSERT INTO "help_categories" ("id", "slug", "title", "hint", "icon", "position", "updatedAt") VALUES ('aide-communautes', 'communautes', 'Communautés', 'Rejoindre, participer, résilier', 'users', 2, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-communautes', 'Comment rejoindre une communauté ?', 'Depuis la fiche d''une communauté, « Rejoindre la communauté », puis réglez le prix d''intégration mensuel fixé par le formateur. Vous accédez alors au forum, aux ressources partagées et aux lives de la communauté.', 0, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-communautes', 'Puis-je annuler mon abonnement à une communauté ?', 'Oui, à tout moment depuis votre espace. La résiliation prend effet à la fin de la période déjà payée : vous conservez l''accès jusque-là, sans remboursement au prorata.', 1, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-communautes', 'Une communauté remplace-t-elle l''achat des ressources ?', 'Non, les deux sont indépendants. Une ressource achetée à l''unité reste à vous même si vous quittez la communauté ; les ressources partagées dans une communauté, elles, ne sont accessibles que tant que vous en êtes membre.', 2, false, CURRENT_TIMESTAMP);

INSERT INTO "help_categories" ("id", "slug", "title", "hint", "icon", "position", "updatedAt") VALUES ('aide-compte', 'compte', 'Mon compte', 'Mot de passe, données, suppression', 'user-cog', 3, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-compte', 'Comment changer mon mot de passe ?', 'Depuis « Profil et paramètres », onglet Sécurité. Le changement déconnecte toutes vos sessions ouvertes, y compris celle en cours : c''est voulu.', 0, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-compte', 'J''ai oublié mon mot de passe, comment faire ?', 'Depuis l''écran de connexion, « Mot de passe oublié ». Un lien de réinitialisation vous est envoyé par email ; si l''adresse n''existe pas chez nous, l''écran affiche le même message : nous ne révélons pas quels emails ont un compte.', 1, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-compte', 'Comment récupérer mes données ?', 'Onglet « Mes données » de votre profil : un fichier JSON contenant votre profil, vos achats, votre progression et vos notifications est produit à la demande.', 2, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-compte', 'Comment supprimer mon compte ?', 'Même onglet. La suppression est différée de {delai_suppression}, pendant lesquels vous pouvez l''annuler vous-même. Vos achats sont ensuite conservés de façon anonymisée : la comptabilité l''impose.', 3, false, CURRENT_TIMESTAMP);

INSERT INTO "help_categories" ("id", "slug", "title", "hint", "icon", "position", "updatedAt") VALUES ('aide-formateur', 'formateur', 'Espace formateur', 'Publier, vendre, être payé', 'shield', 4, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-formateur', 'Comment devenir formateur ?', 'Déposez une candidature depuis « Devenir formateur » : une présentation, une pièce d''identité, un diplôme ou une attestation, et deux minutes de vidéo. Chaque dossier est examiné par notre équipe avant la première publication.', 0, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-formateur', 'Combien NKAMVA retient-il ?', '{commission} du prix de vente. Les {part_formateur} restants vous reviennent et sont crédités à chaque vente confirmée. Il n''y a pas de frais d''entrée. {abonnement_formateur}', 1, true, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-formateur', 'Comment retirer mes revenus ?', 'Chaque vente confirmée crédite votre solde. Dès {retrait_minimum} retirables, vous demandez un retrait depuis votre portefeuille, vers le compte mobile money ou bancaire que vous y avez enregistré. Un compte nouvellement enregistré ou modifié attend {carence_moyen_paiement} avant son premier retrait.', 2, false, CURRENT_TIMESTAMP);
INSERT INTO "help_articles" ("id", "categoryId", "question", "answer", "position", "onHomepage", "updatedAt") VALUES (gen_random_uuid()::text, 'aide-formateur', 'Un acheteur conteste ma ressource, que puis-je faire ?', 'Depuis « Litiges » dans votre espace formateur, vous pouvez transmettre des éléments à l''équipe de modération. Le motif détaillé rédigé par l''acheteur et son identité ne vous sont pas communiqués.', 3, false, CURRENT_TIMESTAMP);
