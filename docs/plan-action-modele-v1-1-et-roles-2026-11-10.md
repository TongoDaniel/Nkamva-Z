# Plan d'action : appliquer le modèle économique v1.1 et organiser l'administration

Rédigé le 10 novembre 2026 pour Jaurès et Daniel. Source qui fait foi : `NKAMVA_Modele_economique_v1_1.pdf` (22 octobre 2026). Lancement : 30 novembre 2026, soit **20 jours**.

## État d'avancement (mis à jour le 10 novembre 2026, branche `feat/modele-v1-1-et-roles`)

Le code de la phase 0 est écrit. Les valeurs « à trancher » sont des réglages, posés à 0 (règle inactive) tant que la décision n'est pas prise ; rien n'est décidé à la place de Jaurès.

| # | Action | État |
|---|---|---|
| 0.1 | Validation du plan et des rôles | **À faire** (Jaurès, Daniel) |
| 0.2 | Cahier des charges | Fait : sections 2.2 et 3.2 réécrites |
| 0.3 | Sauvegarde automatique, restauration testée | Scripts écrits et testés en local (`scripts/sauvegarde-base.sh`, `scripts/restauration-test.sh`) ; **installation sur le serveur à faire** (`docs/exploitation-sauvegarde-surveillance.md`) |
| 0.4 | Surveillance des erreurs | Fait dans le code (journal, audit, e-mail et notification au rôle Technique, webhook optionnel, route d'erreur de test) ; **à vérifier en production** |
| 0.5 | Commission 10 %, plan de base à 0 FCFA | Fait : taux, migration des formateurs et communautés à 15 %, tarif de base à 0 FCFA |
| 0.6 | Plan Pro | Fait : 15 000 FCFA + 3 %, fondateurs (case « fondateur » sur la fiche client, Propriétaire), prise d'effet au règlement, retour sans pénalité, Pro impayé ramené au plan de base. **Liste des fondateurs à fournir** |
| 0.7 | Frais payés par l'acheteur, reçu détaillé | Fait : calcul au franc près sur l'exemple du modèle, écran de paiement, reçu PDF |
| 0.8 | Paiement par carte | **À décider** ; les frais carte reprennent les tarifs Stripe du modèle en attendant |
| 0.9 | Règle de remboursement | Fait : 7 jours, changement d'avis fermé après accès, faute et « qui paie », examen manuel au-delà de 2 en 3 mois, conditions d'utilisation à jour |
| 0.10 | Stockage 5 Go (+1 Go par 50 000 FCFA), 100 Go en Pro | Fait |
| 0.11 | Plafond des lives | Fait : alerte à 80 %, audio à 100 %, 3 lives par semaine, 2 h ; **montant à fixer** (`lives.monthly_overrun_cap_fcfa`) |
| 0.12 | Rôles cumulables et séparation des tâches | Fait : 9 rôles, règles 1, 2, 4 et 5 ; règle 2 **seuil à fixer** (`payouts.dual_approval_threshold_fcfa`), plafond Commercial (`discounts.sales_cap_fcfa`) ; double authentification à imposer une fois chacun enrôlé |
| 0.13 | Fiche client | Fait : `/admin/clients`, relance de la vérification d'un paiement en attente |
| 0.14 | « Commissions sur les ventes » | Fait |
| 0.15 | Recette complète | **À faire** (Jephte), après application des migrations |

Replays : en audio seul jusqu'au 1er mars 2027 (règles du lancement), puis selon le plan Community (Découverte : audio ; les autres : audio et vidéo). Le lecteur sert l'audio quand il n'y a pas d'image.

### Phases 1 à 3 (code écrit le 10 novembre 2026)

| # | Action | État |
|---|---|---|
| 1.1 | Tableau de pilotage | Fait : `/admin/pilotage` (Pilotage, Finances). Part de la base devenue active (taille de la base : réglage `pilotage.trainer_base_size`, **à renseigner**), formateurs actifs et nouveaux, départs, ventes moyennes, apprenants par formateur, face aux trois scénarios ; recettes par source et par mois. **Définitions de mesure à valider par Jaurès** (formateur actif = au moins une vente dans le mois) |
| 1.2 | Période et export CSV | Fait : choix du mois de début et de fin, exports recettes, transactions, files (tracés au journal) |
| 1.3 | Ancienneté des files | Fait : litiges (avec le délai de 72 h ouvrées), signalements, candidatures, retraits, moyens de retrait |
| 1.4 | Formateurs sans vente à 30 jours | Fait : `/admin/suivi-formateurs` (Service client), avec la trace de chaque contact |
| 1.5 | Signal « passez en Pro » | Fait : tâche du 1er de chaque mois, notification et e-mail avec le calcul, au plus une fois tous les deux mois |
| 1.6 | Suivi des lives | Fait : lives, h-participants, présents moyens, dépassement et données estimés, par mois. Les présences mesurées par Merveille et Jaurès restent à faire en direct |
| 1.7 | Tableaux par rôle | Fait : Commercial (entonnoir, fondateurs, proches du seuil Pro, notes de suivi), Communication (`/admin/tendances` : plus consultées, plus vendues, filières, audience, nouveaux formateurs ; sans donnée personnelle ni montant) |
| 1.8 | Enquête de consentement à payer | Hors code (Jaurès, Obama) |
| 2.1, 2.2 | Option A ou B, grille définitive | **À décider** (au plus tard le 29 janvier 2027) |
| 2.3 | Plans Community | Fait avec la grille du modèle v1.1 (`lib/community-plans.ts`), en vigueur au 1er mars 2027 : facturés sur l'échéance mensuelle du formateur, plafond au choix du formateur, droits au règlement, impayé ramené aux droits Découverte. **À reprendre si la grille définitive change** |
| 2.4 | Archivage pour inactivité | Fait : préavis à 5 mois sans connexion ni vente, archivage 30 jours après (ressources retirées du catalogue, rien de supprimé, accès des acheteurs gardé), restauration en un clic par le formateur ou le service client |
| 3.1 | Pro pour tous, grille Community | Automatique au 1er mars 2027 (dates dans le code) |
| 3.2 | Marketing payant | Fait : saisie mensuelle dans le pilotage, coût par nouveau formateur actif |
| 3.3 | Modèle v2 | Hors code (Jaurès) |
| 3.4 | Revue trimestrielle des accès | Fait : rappel aux Propriétaires les 1er mars, juin, septembre et décembre, avec la liste des rôles et des doubles authentifications manquantes |

Point à trancher, apparu en construisant 2.3 : à partir du 1er mars 2027, l'adhésion des membres garde-t-elle son prix fixé par le formateur et sa commission, en plus du plan payé par le formateur ? Le code garde les deux, comme aujourd'hui.

## 1. Où en est le code par rapport au modèle v1.1

| Sujet | Modèle v1.1 | Code actuel | Écart |
|---|---|---|---|
| Commission | 10 % sur le plan « Vous ne payez que quand vous vendez » | 15 % (`lib/commission.ts`) | **À corriger avant le lancement** |
| Plan Pro | 15 000 FCFA/mois + 3 %, pour les formateurs fondateurs dès le 30 novembre, pour tous au 1er mars 2027 | Inexistant ; un seul abonnement de plateforme à deux cadences | **À construire avant le lancement** (fondateurs) |
| Entrée des formateurs | 0 FCFA par mois | Paiement d'un premier abonnement, mais un tarif à 0 FCFA est accepté sans paiement | Réglage : poser un tarif de lancement à 0 FCFA, et le vérifier en recette |
| Frais de paiement | Payés par l'acheteur, calculés selon son pays et son moyen de paiement (encaissement et futur retrait du formateur) | Aucun calcul de frais | **À construire avant le lancement** (le modèle le place en « Préparer », octobre-novembre) |
| Stockage | 5 Go sur le plan de base, plus des Go gagnés avec les ventes (hypothèse : +1 Go par 50 000 FCFA cumulés) ; 100 Go en Pro | 40 Go inclus, puis tranches de 50 Go payantes | À aligner avant le lancement |
| Community | 4 plans payés par le formateur selon le nombre de membres (Découverte 0, Essentiel 10 000, Croissance 25 000, Premium 50 000 FCFA/mois), à partir du 1er mars 2027 | Prix d'adhésion fixé par le formateur, commissionné comme une vente | À construire pour le 1er mars 2027 (après le choix de l'option A ou B en février) |
| Remboursement | Demande sous 7 jours, décision de l'administrateur financier sous 72 h ouvrées, règle « qui paie » selon la faute, examen manuel au-delà de 2 remboursements en 3 mois | Fenêtre de 14 jours | À aligner avant le lancement |
| Signal « passez en Pro » | Après 2 mois consécutifs au-dessus de ~214 000 FCFA de ventes | Absent | Phase de mesure (décembre-janvier) |
| Formateur sans vente | Contact par le service client 30 jours après l'inscription ; archivage des fichiers après 6 mois sans connexion ni vente, préavis 30 jours | Absent | Phase de mesure |
| Lives (lancement) | Jusqu'à 3 lives par semaine, 2 h max, 360p, replays audio ; plafond mensuel de dépassement avec alerte à 80 % et passage en audio à 100 % | Plafond et alertes absents | Avant le lancement (le plafond protège la trésorerie) |
| Prérequis | Sauvegarde de la base et surveillance des erreurs avant le 30 novembre | Aucune sauvegarde automatique trouvée dans le dépôt | **Bloquant pour le lancement** |

Le cahier des charges (`docs/cahier-des-charges.md`, section 2.2) décrit encore l'ancien modèle (15 %, abonnement unique, 40 Go) : il est à mettre à jour pour ne plus guider le développement à rebours.

## 2. Les rôles d'administration proposés

### Ce que montrent les plateformes comparables

- **Stripe** distingue un rôle « Analyst » en lecture seule, un rôle « Support Specialist » qui voit presque tout et peut rembourser sans toucher aux réglages, et un rôle « Developer » qui accède à la technique sans pouvoir modifier les comptes bancaires ([Stripe, nouveaux rôles](https://stripe.com/en-hk/blog/new-roles-and-permissions-in-the-dashboard), [Stripe, rôles personnalisés](https://docs.stripe.com/get-started/account/teams/custom-roles)).
- **Thinkific** sépare administrateur du site, administrateur de cours, analyste de groupe et modérateur de communauté ([Thinkific, rôles](https://support.thinkific.com/hc/en-us/articles/360030353794-Get-Started-with-User-Roles)) ; **Teachable** propose des rôles personnalisés aux offres supérieures ([Teachable, rôles personnalisés](https://support.teachable.com/en/articles/11682540-custom-user-roles)).
- **Shopify** permet de cumuler les rôles : la personne reçoit l'ensemble des permissions de ses rôles ([Shopify, gestion des rôles](https://help.shopify.com/en/manual/your-account/staff-accounts/staff-roles/managing-staff-roles)).
- Les deux principes de référence sont le **moindre privilège** (ne donner que les accès nécessaires à la tâche, revoir les droits régulièrement, tracer les actions privilégiées) et la **séparation des tâches** (personne ne mène seul une opération sensible de bout en bout), formulés dans le catalogue de contrôles NIST SP 800-53 ([AC-6](https://www.upguard.com/compliance/nist-sp-800-53/ac/ac-6), [AC-5](https://www.upguard.com/compliance/nist-sp-800-53/ac/ac-5)).

### Les rôles

Un administrateur peut avoir **plusieurs rôles** ; il reçoit la somme de leurs permissions. Les règles de séparation (section suivante) s'appliquent quand même.

| Rôle | Peut voir | Peut faire | Ne peut pas |
|---|---|---|---|
| **Propriétaire** | Tout | Créer et retirer des administrateurs, attribuer les rôles ; changer tarifs, commission, plans et taux de change | — (deux personnes au plus, toutes les actions tracées) |
| **Pilotage** | Tableau de pilotage du modèle v1.1, recettes, files de tous les domaines, en lecture | Exporter les chiffres | Agir sur un dossier |
| **Finances** | Transactions, portefeuilles, retraits, abonnements, remises | Approuver ou refuser retraits, moyens de paiement et remboursements ; régler abonnements et réconciliations | Changer les tarifs (Propriétaire) |
| **Modération** | Candidatures, signalements, contenus | Valider ou refuser les formateurs, traiter les signalements, sanctionner | Toucher à l'argent |
| **Service client** | Fiche client complète : compte, achats, accès, paiements, litiges, échanges | Rétablir un accès, instruire un litige, **proposer** un remboursement, relancer les formateurs sans vente, rédiger l'aide en ligne | Valider un remboursement, approuver un retrait |
| **Commercial** | Suivi des formateurs : prospection, candidature, validation, première ressource, première vente ; formateurs fondateurs ; formateurs proches du seuil Pro | Créer des remises dans un plafond fixé par le Propriétaire ; noter le suivi d'un formateur | Valider une candidature (conflit d'intérêts avec le recrutement) |
| **Communication** | Tendances : ressources les plus vues et vendues, nouveaux formateurs, filières, croissance de l'audience | Rédiger l'aide en ligne et les annonces | Voir les données personnelles d'un client ou les montants individuels |
| **Technique** | Intégrations, santé des services, journal d'audit, paramètres techniques | Régler les intégrations et paramètres techniques | Approuver un retrait ou un remboursement |
| **Recette** | Uniquement sur l'environnement de test | Tous les rôles, avec des données fictives | Accéder à la production |

### Règles de séparation des tâches

1. **Remboursement** : le service client propose, Finances valide (le modèle v1.1 confie déjà la décision à « l'administrateur financier », sous 72 h ouvrées).
2. **Retraits** : au-delà d'un seuil à fixer par le Propriétaire, deux validations par deux personnes différentes.
3. **Personne n'agit sur son propre dossier** : un membre de l'équipe qui est aussi formateur ne valide ni sa candidature, ni ses retraits, ni ses litiges.
4. **Commercial ne valide pas** les formateurs qu'il recrute.
5. **Changements de prix** (commission, plans, Community) : Propriétaire seulement, tracés au journal d'audit, annoncés avec le préavis de 30 jours prévu par le modèle.
6. **Revue des accès** chaque trimestre par les deux Propriétaires ; retrait immédiat au départ d'un membre.
7. **Double authentification obligatoire** pour tout administrateur : le code la prévoit, mais elle ne bloque l'accès que si `REQUIRE_ADMIN_2FA=1` est posé en production.

### Attribution proposée (à valider ensemble)

| Personne | Rôles | Pourquoi |
|---|---|---|
| Jaurès | Propriétaire, Pilotage, Finances | Le modèle confie la règle de remboursement et les retraits à l'administrateur financier, et les choix de prix au CEO |
| Daniel | Propriétaire, Technique | Il tient la technique ; ne pas cumuler le code de production et l'approbation des paiements |
| Merveille | Service client, Modération | Le modèle lui confie le contact des formateurs sans vente et la mesure des présences aux lives |
| Obama | Commercial | Prospection de la base de 150 à 600 formateurs, enquête de consentement à payer |
| Praïce | Communication | Contenus quotidiens (LinkedIn, TikTok, Instagram, podcasts, articles) |
| Jephte | Recette | Tests de chaque rôle sur l'environnement de test |

À trancher : qui remplace Jaurès sur Finances pendant une absence (sans quoi les remboursements dépasseront les 72 h promises), et le seuil de double validation des retraits.

## 3. Le plan d'action

### Phase 0 : avant le lancement du 30 novembre 2026

| # | Action | Responsable | Échéance | Fait quand |
|---|---|---|---|---|
| 0.1 | Valider ce plan, l'attribution des rôles et les points « à trancher » | Jaurès, Daniel | 13 nov. | Décisions notées dans `docs/decisions-nkamva.md` |
| 0.2 | Mettre le cahier des charges à jour sur le modèle v1.1 | Daniel | 14 nov. | Section 2.2 réécrite |
| 0.3 | Sauvegarde automatique de la base, restauration testée | Daniel | 20 nov. | Une restauration réussie sur l'environnement de test |
| 0.4 | Surveillance des erreurs en production | Daniel | 20 nov. | Une erreur volontaire remonte et alerte |
| 0.5 | Commission à 10 % ; tarif de lancement de l'abonnement à 0 FCFA | Daniel | 18 nov. | Achat de test : 10 % retenus, formateur créé sans paiement |
| 0.6 | Plan Pro (15 000 FCFA/mois + 3 %) pour la liste des formateurs fondateurs, avec paiement mensuel fonctionnel | Daniel ; liste par Jaurès | Liste le 14 nov. ; code le 25 nov. | Un fondateur paie son Pro et une vente lui retient 3 % |
| 0.7 | Frais de paiement ajoutés au prix, payés par l'acheteur, selon pays et moyen ; reçu détaillé (prix, frais, total) | Daniel | 25 nov. | Produit à 20 000 FCFA : l'acheteur MTN paie ~20 595, le formateur reçoit 18 000 |
| 0.8 | Choix du paiement par carte (prestataire agréé CEMAC, Stripe via une société à l'étranger, ou mobile money seul) | Jaurès, Daniel | 14 nov. | Choix noté ; frais recalculés |
| 0.9 | Règle de remboursement du modèle : 7 jours, décision sous 72 h ouvrées, qui paie selon la faute, alerte au-delà de 2 remboursements en 3 mois | Daniel | 25 nov. | Scénarios testés par Jephte |
| 0.10 | Stockage : 5 Go sur le plan de base, 100 Go en Pro | Daniel | 25 nov. | Dépôt bloqué à la limite, rien de supprimé |
| 0.11 | Plafond mensuel de dépassement des lives, alerte à 80 %, passage en audio à 100 % | Montant par Jaurès ; code par Daniel | Montant le 14 nov. ; code le 25 nov. | Simulation du dépassement en recette |
| 0.12 | Rôles cumulables et les quatre nouveaux rôles (Service client, Commercial, Communication, Technique), règles de séparation 1 à 4, double authentification imposée | Daniel | 27 nov. | Jephte teste chaque rôle et chaque interdiction |
| 0.13 | Fiche client pour le service client (compte, achats, accès, paiements, litiges) | Daniel | 27 nov. | Merveille règle un « j'ai payé mais je n'ai pas accès » depuis un seul écran |
| 0.14 | Renommer « Part NKAMVA » en « Commissions sur les ventes » | Daniel | 18 nov. | Libellé changé |
| 0.15 | Recette complète du parcours achat, retrait, remboursement et des rôles | Jephte | 28 nov. | Compte rendu sans anomalie bloquante |

Si les 20 jours ne suffisent pas, l'ordre de repli est le suivant : 0.3, 0.4, 0.5, 0.7 et 0.9 sont indispensables (argent et données) ; 0.6 peut décaler le plan Pro des fondateurs de quelques semaines, en le leur annonçant ; 0.12 et 0.13 peuvent démarrer avec les seuls rôles Service client et Finances.

### Phase 1 : mesurer (décembre 2026 et janvier 2027)

| # | Action | Responsable | Échéance |
|---|---|---|---|
| 1.1 | Tableau de pilotage du modèle v1.1 : part de la base de formateurs devenue active (le premier chiffre qui distingue les scénarios), formateurs actifs face aux scénarios prudent, moyen et ambitieux, ventes moyennes par formateur actif, départs mensuels, apprenants actifs par formateur, recettes par source et par mois | Daniel ; indicateurs validés par Jaurès | 15 déc. |
| 1.2 | Choix de période et export CSV (transactions, recettes, files) | Daniel | 15 déc. |
| 1.3 | Ancienneté de chaque dossier dans les files (litiges, signalements, candidatures, remboursements avec le délai de 72 h) | Daniel | 15 déc. |
| 1.4 | Liste des formateurs sans vente 30 jours après inscription, pour le service client | Daniel ; contacts par Merveille | 31 déc. |
| 1.5 | Signal « passez en Pro » après 2 mois au-dessus de ~214 000 FCFA (premiers signaux possibles fin janvier) | Daniel | 31 janv. |
| 1.6 | Suivi des lives : h-participants, présents moyens, coût, consommation de données | Daniel ; présences par Merveille et Jaurès | Continu |
| 1.7 | Tableaux de bord par rôle (Commercial : suivi des formateurs ; Communication : tendances) | Daniel | 31 janv. |
| 1.8 | Enquête de consentement à payer des formateurs | Jaurès, Obama | 31 janv. |

### Phase 2 : décider (février 2027)

| # | Action | Responsable | Échéance |
|---|---|---|---|
| 2.1 | Choix définitif option A ou B pour les lives, à partir du live test et des mesures | Daniel propose, Jaurès décide | **Fin janvier**, voir ci-dessous |
| 2.2 | Grille Community définitive et annonce aux formateurs | Jaurès | **29 janvier 2027 au plus tard** |
| 2.3 | Construction des 4 plans Community (par nombre de membres, participants par live, stockage) | Daniel | 26 févr. |
| 2.4 | Archivage après 6 mois d'inactivité, avec préavis de 30 jours | Daniel | 26 févr. |

**Point d'attention sur le calendrier du modèle** : il prévoit d'annoncer la grille en février avec un préavis de 30 jours pour une application au 1er mars. Février 2027 compte 28 jours : une annonce le 1er février ne laisse que 28 jours. Pour tenir le préavis, la grille doit être annoncée au plus tard le **29 janvier 2027**, donc l'option A ou B choisie avant.

### Phase 3 : appliquer (1er mars 2027)

| # | Action | Responsable |
|---|---|---|
| 3.1 | Plan Pro ouvert à tous les formateurs ; grille Community en vigueur | Daniel |
| 3.2 | Suivi du marketing payant dans le tableau de pilotage (coût par formateur actif) | Jaurès, Praïce |
| 3.3 | Version 2 du modèle avec les chiffres réels de décembre à février | Jaurès |
| 3.4 | Première revue trimestrielle des accès administrateurs | Jaurès, Daniel |

## 4. Décisions attendues (récapitulatif)

| Décision | Qui | Avant le |
|---|---|---|
| Attribution des rôles et suppléance sur Finances | Jaurès, Daniel | 13 nov. |
| Seuil de double validation des retraits ; plafond des remises du commercial | Jaurès | 13 nov. |
| Liste des formateurs fondateurs | Jaurès | 14 nov. |
| Paiement par carte au lancement | Jaurès, Daniel | 14 nov. |
| Montant du plafond de dépassement des lives | Jaurès | 14 nov. |
| Option « garantie 7 jours » de la règle de remboursement | Jaurès | 14 nov. |
| Solution de versement aux formateurs de la diaspora | Daniel | 25 nov. |
| Option A ou B des lives, grille Community | Jaurès sur proposition de Daniel | 29 janv. 2027 |
