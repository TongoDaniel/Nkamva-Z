# Cas d'utilisation de bout en bout — campagne du 11-12 octobre 2026

Objectif : dérouler plusieurs parcours complets, **sur la durée** (cinq mois simulés), à partir des données réellement présentes, et y ajouter des gestes absurdes ou imprévus, pour relever les incohérences et les manques. Rien n'a été corrigé : ce document constate.

## Méthode

- **Données de départ** : une copie de la base de dev (`nkamva_uc`, créée par `CREATE DATABASE … TEMPLATE nkamva`). La base `nkamva` n'a pas été touchée. Au départ : 9 comptes (7 apprenants, 2 formateurs), 2 communautés, 0 ressource, **aucun administrateur**, **grille tarifaire vide**, aucun réglage.
- **Serveur** : `next dev` sur le port 3100, branché sur la copie. Courriels coupés (journalisés), tâches planifiées coupées (je les ai jouées moi-même).
- **Fournisseurs réels** : PawaPay **sandbox** (il est configuré en dev, contrairement à ce que disait une note d'août), Stripe en mode test, stockage R2 de test (fichiers de quelques centaines d'octets).
- **Machine à remonter le temps** : une horloge décalée, chargée à la fois dans le serveur (`NODE_OPTIONS --require`) et dans les scripts, pilotée par un fichier. Les tâches planifiées ont été jouées nuit après nuit, dans l'ordre du cron, du 12 octobre 2026 au 12 mars 2027.
- **Limite connue de cette méthode** : les colonnes `createdAt`/`updatedAt` remplies par le moteur Prisma (code natif) gardent l'heure **réelle**. Tout constat qui repose sur `createdAt` a donc été écarté (exemple : les rappels de suppression envoyés chaque jour étaient un artefact, pas un défaut).
- **Personnages** : Mariam (devient formatrice), Paul (apprenant), Ada (super-administratrice créée par `scripts/bootstrap-super-admin.ts`), « xss », « rtl », « num », « zz » (comptes aux saisies absurdes), plus Awa, Yao, Bintou, Koffi… déjà présents.

Scripts de la campagne : `.uc/` et `.uc-launch.cjs` à la racine (exclus de git localement via `.git/info/exclude`). Pour tout effacer : `docker exec nkamva-db psql -U nkamva -d postgres -c "DROP DATABASE nkamva_uc"`, puis supprimer `.uc/`, `.uc-launch.cjs` et l'entrée `nkamva-uc-3100` de `.claude/launch.json`.

---

## Synthèse

| # | Gravité | Constat |
|---|---|---|
| B1 | **Bloquant** | Un renouvellement d'adhésion payé par mobile money est **impossible à régler** |
| B2 | **Bloquant** | Une ressource **sans fichier** peut être publiée, vendue et facturée |
| M1 | Majeur | Retraits, remboursements et règlements d'abonnement n'ont **aucune réconciliation** : NKAMVA diverge de PawaPay pour toujours |
| M2 | Majeur | Un formateur qui règle avec retard est **re-suspendu la nuit même** et facturé pour le mois où il était suspendu |
| M3 | Majeur | La communauté d'un formateur suspendu **reste en vente** |
| M4 | Majeur | Un bannissement **expire** avec la période : la personne bannie réadhère aussitôt |
| M5 | Majeur | Un membre qui supprime son compte laisse une adhésion **ACTIVE éternelle** |
| M6 | Majeur | Un compte **jamais vérifié** se connecte et utilise tout |
| M7 | Majeur | Le plafond « 3 retraits / 24 h » compte les **refus** : trois erreurs bloquent les retraits une journée |
| M8 | Majeur | Un code TOTP est **rejouable** pendant sa fenêtre |
| M9 | Majeur | La page `/tarifs` **se contredit** dès que la grille devient payante |
| m1–m21 | Mineur / détail | Voir plus bas |

---

## Bloquants

> **État au 25 octobre 2026 : B1 et B2 sont corrigés.** B1 — l'échéance naît
> sans transaction et s'ouvre chez le fournisseur au clic « Régler » ; la
> migration `20261025120000_echeances_adhesion_sans_transaction` répare les
> échéances déjà ouvertes avec un identifiant fictif ; prouvé contre le bac à
> sable PawaPay par `scripts/smoke-renouvellement-adhesion.ts`. B2 — la
> confirmation refuse un objet absent quand R2 est configuré, et la publication
> relit le stockage. Les ressources déjà publiées sans fichier sur le staging ne
> sont pas retirées automatiquement.

### B1 — Renouvellement d'adhésion impayable par mobile money

- **Parcours** : Paul adhère à la communauté de Mariam (2 500 FCFA/mois, MTN MoMo, sandbox) le 11 octobre. Le 11 novembre, la tâche `MEMBERSHIP_RENEWAL` passe l'adhésion en `PAST_DUE` et le notifie : « Votre adhésion … est à régler ».
- **Observé** : la tâche crée l'échéance avec un identifiant **fictif** `cp_<uuid>` qui n'a jamais été envoyé à PawaPay ([memberships.ts:765](src/lib/memberships.ts:765)). Quand Paul clique « Régler 2 500 FCFA », la reprise considère ce paiement en attente comme « reprenable tel quel » ([memberships.ts:292](src/lib/memberships.ts:292)) et répond `CONFIRM_ON_PHONE` avec ce `cp_…` : **rien n'arrive sur son téléphone**, la réconciliation reste `PENDING`. S'il choisit la carte à la place : `409 PAYMENT_IN_PROGRESS`. Le 25 novembre, l'adhésion expire « impayée ». Même sort pour Bintou et Mariam (chez Awa).
- **Conséquence** : aucun membre mobile money ne peut renouveler. Le revenu récurrent des communautés s'arrête au premier mois. Le même schéma (`pi_<uuid>` fictif) existe pour Stripe ; non éprouvé faute de paiement carte abouti.

### B2 — Ressource publiée sans fichier

- **Parcours** : Mariam crée « Ressource fantôme » (PDF, 5 000 FCFA), demande une URL de dépôt, **n'envoie rien**, puis confirme — y compris avec une clé inventée `course-assets/<id>/invente-de-toutes-pieces.pdf`.
- **Observé** : `confirmCourseUpload` ne contrôle le fichier **que s'il existe** (`if (head)`, [courses.ts:603](src/lib/courses.ts:603)) ; absent, il enregistre une taille de 0 et passe. La publication n'exige que `contentS3Key`. Paul achète : paiement PawaPay encaissé, 4 250 FCFA crédités à Mariam, facture NK-2026-000015 émise, notifications envoyées, et le lien de lecture rend **404 `NoSuchKey`**. Le lecteur affiche « Chargement du document… » indéfiniment.
- **À noter** : les pièces de candidature, elles, sont bien refusées dans ce cas (`UPLOAD_NOT_FOUND`) — l'asymétrie vient du commentaire « sans identifiants R2, la validation est sautée », qui couvre aussi, sans le vouloir, l'objet manquant avec R2 configuré.
- **Prolongement** : après remboursement intégral pour « fichier inexistant », la ressource reste publiée ; à la réactivation de Mariam, elle est même **republiée automatiquement**.

---

## Majeurs

### M1 — Pas de réconciliation pour les retraits, les remboursements et les abonnements

Les achats et l'activation ont un chemin qui redemande l'état au fournisseur. Ces trois flux n'en ont pas : ils dépendent uniquement du rappel PawaPay/Stripe.

| Flux | État chez PawaPay (sandbox) | État chez NKAMVA | Fonction existante jamais appelée |
|---|---|---|---|
| Retrait de 10 000 FCFA (12 oct.) | `COMPLETED` | `APPROVED` jusqu'au 10 mars (mark-paid manuel) | `checkPayout` ([pawapay.ts:493](src/lib/pawapay.ts:493)) |
| Remboursement du litige (5 000 FCFA) | `COMPLETED` | `refundStatus: PENDING` pour toujours | `checkRefund` ([pawapay.ts:567](src/lib/pawapay.ts:567)) |
| Règlement d'abonnement (5 000 FCFA) | `COMPLETED` | formatrice toujours `SUSPENDED` | aucune |

Conséquences enchaînées, observées sur cinq mois :
- le retrait bloqué empêche **tout nouveau retrait** (`PAYOUT_IN_PROGRESS`) et tout changement de moyen de paiement ;
- `/admin/retraits` affiche « 10 000 FCFA immobilisé » mais « 0 à instruire, 0 hors délai » : l'alerte de délai ne couvre que `IN_REVIEW`, rien ne signale un `APPROVED` qui dort ;
- les 4 250 FCFA réservés par le litige ne sont **jamais libérés ni débités** ; le solde ne peut donc jamais revenir à zéro, et Mariam **ne peut pas supprimer son compte** (`WALLET_NOT_EMPTY`) ;
- Paul voit « Accès suspendu le temps d'un litige » deux mois après un litige tranché et remboursé ; aucun avoir n'est émis.

Sur localhost c'est systématique (aucun rappel n'y arrive) ; en staging, il suffit d'un rappel perdu.

### M2 — Règlement tardif : re-suspension immédiate

- **Parcours** : Mariam, suspendue le 25 janvier, règle le 10 mars l'échéance de janvier.
- **Observé** : le règlement replace la fin de période sur celle de l'échéance payée, **le 10 février** ([subscription-payment.ts:355](src/lib/subscription-payment.ts:355)), déjà passée. La nuit suivante, la même minute : nouvelle échéance (10 février → 10 mars, période où elle était suspendue et ne pouvait rien vendre), puis suspension immédiate puisque « 14 jours » sont déjà écoulés. Elle reçoit deux notifications contradictoires : « Sans règlement sous 14 jours… » et « Vos ressources sont retirées… impayé après 14 jours ». Bilan : 5 000 FCFA pour environ seize heures d'activité.

### M3 — La communauté d'un formateur suspendu reste en vente

Pendant la suspension de Mariam (ressources archivées, publication, lives et réglages bloqués), sa fiche communauté affiche toujours « Rejoindre — 2 500 FCFA / mois » et « 1 ressource incluse ». « xss » a adhéré, payé et été crédité au portefeuille de la formatrice suspendue. Le message de suspension dit pourtant « Vos ressources ne sont plus en vente ».

### M4 — Le bannissement expire avec la période

`renewDueMemberships` traite les adhésions `BANNED` comme les autres à l'échéance ([memberships.ts:685](src/lib/memberships.ts:685)) et les ferme en `EXPIRED`. `initiateMembershipPayment` ne regarde aucun bannissement passé. Bintou, bannie de l'Atelier Montage, est passée `EXPIRED` à la première nuit, puis a réadhéré et payé dans la minute.

### M5 — Adhésion éternelle d'un compte supprimé

« xss » supprime son compte avec une adhésion payée la veille. Après la purge (31 janvier), l'adhésion reste `ACTIVE` : le renouvellement exclut les comptes supprimés ([memberships.ts:693](src/lib/memberships.ts:693)) et rien d'autre ne la ferme. Le 10 mars, cinq semaines après sa fin de période : « 1 membres » sur la fiche publique, un membre sans nom dans la liste de la formatrice, et un obstacle `ACTIVE_COMMUNITY` si celle-ci veut un jour fermer son compte.

### M6 — Un compte jamais vérifié est pleinement utilisable

Inscription par le formulaire, abandon sur l'écran du code, puis connexion par mot de passe : arrivée sur `/accueil`, session valide. Seules les invitations exigent `emailVerifiedAt`. Le profil propose « Vérifier maintenant », sans rien imposer. On peut donc acheter, candidater et devenir formateur avec une adresse qu'on ne contrôle pas.

### M7 — Le plafond de retraits compte les refus

`/api/trainer/payouts` consomme le quota (3 / 24 h) **avant** de valider la demande. Trois refus (« moyen non vérifié », montant sous le minimum…) bloquent les retraits pendant 24 h, avec le message « Trop de demandes, réessayez plus tard », qui n'indique pas la durée. Même logique pour la création de moyen de paiement (3 / 24 h, un refus « 2FA requise » compte).

### M8 — Code TOTP rejouable

Le même code à 6 chiffres a servi deux fois de suite, à quelques secondes d'écart, pour créer puis **remplacer** le moyen de retrait. `totp.validate` ([two-factor.ts:245](src/lib/two-factor.ts:245)) ne mémorise pas le dernier pas utilisé. Or c'est précisément ce second facteur qui protège l'adresse des versements.

### M9 — `/tarifs` se contredit

Une fois le tarif à 5 000 FCFA/mois en vigueur : le bandeau, codé en dur ([tarifs/page.tsx:110](src/app/(public)/tarifs/page.tsx:110)), dit « Pas d'abonnement obligatoire, ni pour apprendre, ni pour publier », et le bloc juste en dessous dit « Formateur 5 000 FCFA/mois ». Le libellé du tarif (« Fin de la gratuité ») remplace aussi la phrase « Rien à payer d'avance » dans la carte.

---

## Mineurs et détails

| # | Constat | Où |
|---|---|---|
| m1 | Nom légal vérifié = deux espaces accepté à l'approbation (`min(2)` sans `trim`). Il est recopié sur le moyen de paiement, et Finances le valide sans alerte (« Nom légal vérifié » vide à l'écran) | [approve/route.ts:11](src/app/api/admin/trainer-applications/[applicationId]/approve/route.ts:11) |
| m2 | `websiteUrl: "javascript:alert(1)"` accepté par le serveur (le formulaire, lui, n'accepte que http/https) et rendu en `href` sur l'écran de modération. React 19 neutralise `javascript:`, mais pas les autres schémas | [trainer-applications/route.ts:9](src/app/api/trainer-applications/route.ts:9) |
| m3 | Prix 2 147 483 648 → **500** (pas de plafond, dépassement de l'entier) ; 2 147 483 647 FCFA accepté | [trainer/courses/route.ts:22](src/app/api/trainer/courses/route.ts:22) |
| m4 | Slugs dégénérés : titre en emojis → slug **vide**, titre arabe → `-1`, titre d'espaces → `-2`. Titre, résumé, description et catégorie faits d'espaces sont acceptés | `generateSlug`, `CreateSchema` |
| m5 | Format et catégorie libres : `format: "hologramme"` n'impose aucun type de fichier ; catégorie `💩` acceptée | `CONTENT_KIND_BY_FORMAT` |
| m6 | Recherche : `%` et `_` renvoient tout le catalogue (jokers non échappés) ; `maxPrice=abc` → **500** ; « rôbe » ne trouve pas « robe » | [catalog/courses/route.ts:14](src/app/api/catalog/courses/route.ts:14) |
| m7 | Signalements acceptés contre soi-même, contre un UUID inexistant, ou avec un type incohérent (`USER` + id de cours) : la file de modération se remplit de cibles fantômes | `/api/reports` |
| m8 | Invitation « cadeau » à un administrateur acceptée et envoyée, alors qu'il ne pourra jamais l'utiliser (l'auto-invitation, elle, est refusée) | invitations |
| m9 | Double clic sur « Payer » : un seul achat, mais une ligne « **Annulé 20 000 FCFA** » apparaît dans l'historique de l'apprenant et dans les ventes de la formatrice | `/mes-achats`, `/formateur/ventes` |
| m10 | Changer de moyen pendant un paiement en cours : « Un paiement est déjà en cours **sur ce moyen** » alors qu'il s'agit de l'autre moyen | message `PAYMENT_IN_PROGRESS` |
| m11 | Notification d'échéance d'adhésion : « 5000 FCFA » sans espace des milliers (ailleurs « 5 000 FCFA ») ; « 1 membres » ; « Vos 3 ressource(s) » | `renewDueMemberships`, fiches communauté |
| m12 | Lives : programmation acceptée dans le passé, en l'an 9999, et en chevauchement pour le même hôte. Les séances `SCHEDULED` jamais lancées (deux de septembre) restent « programmées » indéfiniment | `/api/lives` |
| m13 | Pays « ZZ » et « 42 » acceptés à l'inscription et au profil. La recherche du nom de compte mobile money est codée sur le Cameroun, alors que le versement suit le pays du profil : un formateur hors Cameroun est comparé au mauvais opérateur | [payout-methods.ts:82](src/lib/payout-methods.ts:82), [payouts.ts:341](src/lib/payouts.ts:341) |
| m14 | Règles de mot de passe différentes : inscription et réinitialisation = 10 caractères ; changement = 10 + une majuscule + un chiffre. Mot de passe identique à l'adresse e-mail accepté | `/api/auth/register`, `/api/me/password` |
| m15 | Noms d'affichage trompeurs acceptés : caractères de largeur nulle (« ​​​A » franchit le minimum de 2), inversion droite-à-gauche (`Admin‮gnp.exe` s'affiche « Adminexe.png ») | `/api/auth/register`, profil |
| m16 | Redemander la suppression du compte **repousse** l'échéance de 30 jours à chaque fois | `requestDeletion` |
| m17 | Formateurs suspendus, sans aucune ressource au catalogue, mis en avant dans « Formateurs à découvrir » | `/accueil` |
| m18 | Fin de période calculée en heure locale du serveur (`setMonth`) : +1 h au passage à l'heure d'hiver, et un 31 janvier donne un 3 mars. Sans effet si le serveur tourne en UTC | [subscriptions.ts:46](src/lib/subscriptions.ts:46), [memberships.ts:69](src/lib/memberships.ts:69) |
| m19 | Tant que la tâche n'est pas passée, une adhésion échue affiche « Vous êtes membre. Prochaine échéance le 4 octobre 2026 » (date passée) | espace membre |
| m20 | Une facture à 0 FCFA est émise pour chaque mois offert | `issueInvoiceForSubscriptionCharge` |
| m21 | Message de 1 caractère invisible (`​`) accepté en messagerie, alors qu'un message d'espaces est refusé | conversations |

### Constats de produit (pas des bogues, mais à arbitrer)

- **Tout le monde suspendu.** Dès que la grille passe à 5 000 FCFA, les trois formateurs sont suspendus en un mois : le prélèvement automatique est désactivé par défaut, et Mariam l'a été alors qu'elle avait 9 125 FCFA retirables.
- **Retirable tout de suite.** Le solde est retirable dès la vente, pendant la fenêtre de contestation de 14 jours : un remboursement après retrait mettra le portefeuille en négatif (cas prévu par la décision 13).
- **Rien ne retire une ressource reconnue défectueuse.** Un litige qui établit « le fichier vendu n'existe pas » ne retire pas la ressource de la vente.

### Environnement

- La base de dev `nkamva` n'a pas la migration `20261001120000_otp_purpose` (51 appliquées sur 52). Tout parcours OTP y échouera tant qu'elle n'est pas jouée.

---

## Ce qui a tenu (et qui a été éprouvé)

- Double clic et clics simultanés sur « Payer » : un seul achat réglé.
- Refus attendus : acheter sa propre ressource, admin qui achète ou adhère, rejoindre sa propre communauté, ressource incluse vendue à l'unité, second litige sur un même achat, litige contre l'achat d'un autre.
- Montants cohérents d'un écran à l'autre : 25 000 FCFA encaissés, 3 750 FCFA de commission, 21 250 FCFA nets — tableau de bord, ventes, portefeuille, notifications et factures concordent ; la vente à 20 000 FCFA crédite bien 17 000 FCFA.
- Dépôts : exécutable déguisé en PNG refusé (nombre magique), taille déclarée mensongère refusée par R2 (403), durée vidéo mesurée (12 min 34 s → « 13 min »), pages PDF comptées (7).
- Authentification : code OTP croisé refusé, code rejoué refusé, réinitialisation en deux écrans fonctionnelle, mot de passe fuité refusé (HIBP), 2FA exigée pour un moyen de retrait, code de secours à usage unique, adresse avec espaces normalisée par le formulaire.
- Suspension : les achats déjà faits restent lisibles ; réactivation qui republie les ressources ; `mark-paid` idempotent ; numérotation des factures repartie à `NK-2027-000001` au changement d'année.
- Lectures interdites : contenu non acheté (403), anonyme (401), conversation d'un autre (404) ; injection SQL dans la recherche sans effet.
