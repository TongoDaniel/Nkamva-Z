-- Préférence d'envoi des emails d'information sur l'abonnement.
--
-- Par défaut à `true` : un formateur déjà en base doit continuer d'être prévenu
-- qu'un tarif change. Le silence par défaut serait le mauvais choix — c'est une
-- information qui engage son argent.
--
-- Le réglage ne porte que sur l'annonce tarifaire et son rappel. Les emails de
-- fonctionnement (vérification, facture, impayé, litige) l'ignorent.
ALTER TABLE "users" ADD COLUMN "subscriptionNoticeEmails" BOOLEAN NOT NULL DEFAULT true;
