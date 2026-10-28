# Audit des cas limites par rôle — 28 octobre 2026

Objectif : recenser ce qui peut mal tourner pour chaque rôle — cas prévus, imaginables ou connus ailleurs —, et relever les manques, erreurs, incohérences, contradictions et valeurs codées en dur. Base : `develop` à `45df993` (toutes les PR #36 à #53 fusionnées).

## Méthode et limites

- **Lecture du code**, module par module, sur les chemins à risque : argent (achats, adhésions, portefeuille, retraits, litiges, chargebacks), comptes, contenus, communautés, messagerie, directs, administration, tâches planifiées, textes affichés.
- **Recherche externe** : droit camerounais (données personnelles, commerce électronique, consommation, TVA), fonctionnement de PawaPay, fraude au mobile money.
- **Rien n'a été éprouvé en direct** : Docker Desktop est en panne sur le poste (voir la note du 28 octobre), donc ni base locale ni serveur. Chaque constat ci-dessous est établi par le code, avec sa référence ; ceux qui demandent une épreuve réelle sont marqués *à éprouver*.
- **Pas de doublon** : les constats des campagnes du 12 octobre (B1–B2, M1–M9, m1–m21) et du 27 octobre (PR #49) sont **tous corrigés** sur `develop` ; ils ne sont pas répétés.

## Synthèse

| # | Gravité | Constat |
|---|---|---|
| L1 | **Bloquant (lancement)** | 17 mentions légales encore « à fournir » sur les pages publiques : droit applicable, juridiction, identité de l'éditeur, hébergeurs, autorité de protection des données |
| L2 | **Bloquant (lancement)** | Loi camerounaise 2024/017 sur les données personnelles **en vigueur depuis le 23 juin 2026** : transferts hors du territoire (base à Francfort, fichiers sur R2) non encadrés, consentement, déclaration à l'autorité |
| L3 | Majeur (juridique) | Aucune limite d'âge : ni dans les CGU, ni dans le code, alors qu'il y a paiement, messagerie privée avec des adultes et directs filmés |
| L4 | Majeur (juridique) | Directs **tous enregistrés** (voix, image, écran des participants) sans avis dans la salle ni ligne dans la politique de confidentialité ; replays gardés 24 mois |
| L5 | À faire valider | Droit de rétractation de 14 jours (loi-cadre 2011/012) face à « téléchargé = non remboursable » ; TVA 19,25 % sur les plateformes de commerce électronique (LF 2020) non traitée |
| A1 | **Majeur** — ✅ corrigé (PR liens et textes) | 16 liens de notifications et d'e-mails mènent à des pages qui n'existent pas : messages d'argent (retrait échoué, approuvé, moyen de paiement à revoir, chargeback, remboursement manuel) et litiges du formateur |
| A2 | **Majeur** | Le fichier d'une ressource **déjà vendue** peut être remplacé à tout moment, sans garde ni avis aux acheteurs ; l'ancien fichier reste orphelin sur R2 |
| A3 | **Majeur** | Un formateur au reliquat ≤ 500 FCFA ne peut **jamais** supprimer son compte : le reliquat n'est ni versable ni abandonnable, et la suppression exige un solde de 0 exactement |
| A4 | Majeur | Les membres d'un formateur **suspendu** continuent d'être facturés à chaque renouvellement |
| A5 | Majeur | Prix d'une communauté **sans maximum** : dépassement de l'entier 32 bits (le défaut m3 n'a été corrigé que pour les ressources) |
| A6 | Majeur | Hausse du prix d'une communauté appliquée au renouvellement suivant **sans prévenir les membres** |
| A7 | Majeur — ✅ corrigé (PR liens et textes) | Litige : le formateur reçoit « Motif : CONTENT_MISMATCH » (code technique) et un bouton « Contester cette décision » alors qu'aucune décision n'est prise |
| A8 | Majeur | Remboursement fait depuis le tableau de bord Stripe (`charge.refunded`) **ignoré** : l'accès reste ouvert, le formateur reste crédité |
| A9 | Majeur | Aucune remise à zéro du second facteur par un administrateur : un formateur qui perd téléphone **et** codes de secours ne peut plus jamais retirer |
| A10 | Majeur | Second facteur des administrateurs **non obligatoire** tant que `REQUIRE_ADMIN_2FA=1` n'est pas posé sur le serveur (configuration hors dépôt, à vérifier) |
| A11 | Majeur | Impossible de changer d'adresse e-mail : une adresse perdue, piratée ou mal saisie ne se corrige pas |
| A12 | Majeur | Messagerie : aucun blocage entre personnes, aucun retrait de message (même le formateur dans son groupe) |
| a1–a10 | Mineur | Voir plus bas |
| P1–P5 | À arbitrer | Choix de produit qui ouvrent un risque |

---

## Juridique et conformité

### L1 — Mentions légales incomplètes, visibles en ligne

Les pages `/legal/conditions`, `/legal/confidentialite` et `/legal/mentions` affichent 17 champs `<ToProvide>` : dénomination et forme juridique, numéro d'immatriculation, siège et représentant légal, directeur de la publication, capital, numéro de TVA, hébergeur applicatif, hébergeur de la base, hébergeur du stockage objet, annexe des sous-traitants, **droit applicable**, **juridiction compétente**, **autorité de protection des données**, adresses de contact.

Sans droit applicable ni juridiction, les CGU ne disent pas quel tribunal tranche un différend ; sans identité de l'éditeur, le site ne satisfait pas l'obligation d'identification d'un vendeur en ligne.

### L2 — Loi 2024/017 sur les données personnelles

La loi du 23 décembre 2024 est applicable depuis la fin du moratoire de 18 mois, **le 23 juin 2026**. Points qui touchent NKAMVA :

- **Transferts hors du territoire**, strictement encadrés : la base de développement et de staging est à Francfort, les fichiers (pièces d'identité des formateurs comprises) sur Cloudflare R2. La politique de confidentialité ne nomme ni les pays ni les garanties.
- **Consentement explicite, libre et éclairé** : à rapprocher du cas des directs (L4).
- **Autorité de protection des données** : créée par la loi ; la politique de confidentialité laisse son nom « à fournir ».
- Le registre des traitements (`docs/registre-des-traitements.md`) existe : c'est la bonne base pour la mise en conformité.

### L3 — Aucune limite d'âge

Ni les CGU (la seule mention de « mineurs » vise les contenus qui les mettent en danger) ni le code (aucune date de naissance, aucune case « j'ai 18 ans ») ne posent d'âge minimum. Or un compte peut payer, écrire en privé à des adultes, rejoindre des directs filmés et devenir formateur.

À trancher : âge minimum, déclaration à l'inscription, et ce qu'on fait d'un mineur signalé.

### L4 — Enregistrement des directs sans information

L'arbitrage 38 enregistre tout direct, sans case à cocher. Le formateur en est averti à la programmation ([schedule-live.tsx:119](src/components/screens/schedule-live.tsx:119)). Les **participants** — dont la voix, l'image ou l'écran partagé peuvent être enregistrés — ne voient aucun avis dans la salle, et la politique de confidentialité ne parle ni de direct ni d'enregistrement. Le replay est conservé 24 mois.

### L5 — À faire valider par un juriste

- **Rétractation** : la loi-cadre 2011/012 sur la protection du consommateur prévoit un délai de rétractation de 14 jours (décret 2011/1521, art. 13 et suivants). NKAMVA refuse tout remboursement d'une ressource téléchargée ([disputes.ts:168](src/lib/disputes.ts:168)). L'exception pour un contenu numérique livré n'est pas établie en droit camerounais par les sources trouvées.
- **TVA** : depuis la loi de finances 2020, les opérations des plateformes de commerce électronique et leurs commissions sont imposables au taux de 19,25 %. Le code n'en calcule aucune ([invoices.ts:20](src/lib/invoices.ts:20)), ce que le cahier des charges reconnaît déjà comme ouvert. La loi de finances 2026 ajoute des seuils (utilisateurs, chiffre d'affaires) dont les valeurs diffèrent selon les sources.

---

## Constats dans le code

### A1 — Liens de notification morts, tous sur l'argent

`/formateur/paiements`, `/formateur/litiges/<id>/contester`, `/admin/payouts/<id>`, `/admin/payout-methods`, `/admin/payout-methods/escalations`, `/admin/achats/<id>` et `/admin/remboursements-manuels` n'existent pas (les écrans sont `/formateur/portefeuille`, `/admin/retraits`, `/admin/moyens-de-paiement`, `/admin/remboursements`, `/admin/transactions`). Aucune redirection ne les rattrape.

| Fichier | Lignes | Message concerné |
|---|---|---|
| [payouts.ts](src/lib/payouts.ts:206) | 206, 281, 448, 520, 569, 575, 733 | Retrait à instruire, approuvé, versé, échoué |
| [payout-methods.ts](src/lib/payout-methods.ts:685) | 685, 694, 732, 829, 1125 | Moyen de paiement à revoir, escalade, décision |
| [disputes.ts](src/lib/disputes.ts:480) | 480, 868, 1088, 1259 | Litige ouvert et tranché (côté formateur), remboursement manuel à faire, chargeback sur vente remboursée |

Le commentaire de [payout-methods.ts:407](src/lib/payout-methods.ts:407) constate déjà que `/formateur/paiements` « n'a jamais correspondu à une page », mais n'avait corrigé qu'un seul des neuf liens. Le garde-fou d'atteignabilité ne lit pas les liens écrits dans `src/lib`.

**Corrigé** : chaque lien pointe vers l'écran réel, et `tests/liens-internes.test.ts` vérifie désormais que tout lien écrit dans `src/lib` (`link:`, `absoluteUrl(…)`, variable `…Link`) mène à une page existante.

### A2 — Remplacement du fichier d'une ressource vendue

`deleteCourseContent` refuse de supprimer le contenu d'une ressource vendue (`obligationAt`). Mais [confirmCourseUpload](src/lib/courses.ts:573) accepte un nouveau fichier sur la même ressource **sans** cette garde :

- un formateur peut vendre un bon fichier puis le remplacer par un fichier vide ou différent ; les acheteurs n'en sont pas avertis, et au-delà de 14 jours ils ne peuvent plus contester ;
- la durée et le nombre de pages sont recalculés : le seuil de consommation d'un litige en cours change sous les pieds de l'apprenant ;
- l'ancien objet n'est pas supprimé : il reste sur R2, payé, et n'est plus compté dans le quota.

Une mise à jour légitime (corriger une coquille) doit rester possible : à arbitrer entre « interdit après la première vente », « autorisé avec avis aux acheteurs et historique », ou « nouvelle version, l'ancienne reste servie ».

### A3 — Compte formateur impossible à fermer pour quelques francs

[profile.ts:353](src/lib/profile.ts:353) exige un solde de **0 exactement**. Un retrait ordinaire demande 10 000 FCFA ; le retrait de clôture retient 500 FCFA de frais et refuse un montant ≤ 500 FCFA ([payouts.ts:78](src/lib/payouts.ts:78), `AMOUNT_BELOW_FEES`). Aucun geste ne permet d'abandonner un reliquat. Un formateur à 300 FCFA, ou à solde négatif après un remboursement, ne peut donc **jamais** exercer son droit à l'effacement.

### A4 — Membres d'un formateur suspendu toujours facturés

La correction M3 empêche un formateur suspendu d'accueillir de **nouveaux** membres. Mais le renouvellement ([memberships.ts:809](src/lib/memberships.ts:809)) ne ferme une adhésion que si elle est résiliée, bannie ou si la communauté est fermée : les membres existants reçoivent une échéance chaque mois, pendant que le formateur ne peut ni programmer de direct ni publier.

### A5 — Prix de communauté sans plafond

[trainer/communities/route.ts:22](src/app/api/trainer/communities/route.ts:22) et [communities/[communityId]/route.ts:23](src/app/api/trainer/communities/[communityId]/route.ts:23) n'ont qu'un minimum (500). Les ressources ont un maximum de 10 000 000 FCFA (`MAX_COURSE_PRICE_FCFA`) depuis la correction m3 ; les communautés non. Un prix de 2 147 483 648 dépasse la colonne `Int` → erreur 500 *(à éprouver)*.

### A6 — Hausse de prix silencieuse

Le renouvellement facture le prix **courant** de la communauté ([memberships.ts:871](src/lib/memberships.ts:871)). Un changement de prix n'est que journalisé (`priceFrom` / `priceTo`) : aucun membre n'est prévenu. Passer de 2 500 à 50 000 FCFA s'appliquerait à tous au mois suivant. L'abonnement formateur, lui, prévient d'un changement de tarif (`pricing.ts:316`) : l'asymétrie est à corriger.

### A7 — Textes du litige côté formateur

[disputes.ts:484](src/lib/disputes.ts:484), 496, 506 et 885-886 interpolent les codes bruts : « Motif : CONTENT_MISMATCH », « Décision : FULL_REFUND ». Le courriel d'ouverture propose « Contester cette décision » alors que rien n'est encore décidé. Même défaut côté administration : « USER, motif SPAM » ([reports.ts:97](src/lib/reports.ts:97)) et « 10000 FCFA » sans espace ([payouts.ts:574](src/lib/payouts.ts:574), et le remboursement manuel « 5000 FCFA à rembourser (PAWAPAY) »).

**Corrigé** : motifs et décisions en clair (`REASON_LABELS`, nouveau `RESOLUTION_LABELS`), bouton « Répondre à ce litige » à l'ouverture, libellés des signalements partagés dans `lib/report-labels.ts`, montants formatés.

### A8 — Remboursement fait hors de NKAMVA

Le webhook Stripe traite le paiement abouti et les chargebacks ([webhooks/stripe/route.ts:70-148](src/app/api/webhooks/stripe/route.ts:70)), pas `charge.refunded`. Un remboursement fait à la main dans le tableau de bord Stripe (le réflexe d'un support pressé) laisse l'accès ouvert et le formateur crédité. Même question pour un remboursement fait chez l'opérateur mobile money en dehors de PawaPay.

### A9 — Second facteur perdu

[two-factor.ts](src/lib/two-factor.ts:197) ne permet de désactiver le second facteur qu'avec un code valide. Aucun écran d'administration ne le remet à zéro. Le second facteur protège les retraits ([assertSecondFactorForPayout](src/lib/two-factor.ts:386)) : un formateur sans téléphone ni codes de secours a de l'argent qu'il ne peut plus sortir. Il faut une procédure de récupération (vérification d'identité par Finances, délai de carence, journalisation).

### A10 — 2FA des administrateurs facultative par défaut

[two-factor.ts:347](src/lib/two-factor.ts:347) : l'obligation ne bloque que si `REQUIRE_ADMIN_2FA=1`. Les administrateurs approuvent des retraits et lèvent des sanctions. Vérifier que la variable est posée sur le staging, et qu'elle le sera en production une fois les administrateurs enrôlés.

### A11 — Adresse e-mail immuable

Aucune route ne change l'adresse (`/api/me/*` : 2fa, avatar, password, profile…). C'est l'identifiant de connexion et le canal de l'OTP : une adresse perdue ou mal saisie rend le compte irrécupérable sans intervention en base.

### A12 — Messagerie sans défense individuelle

[messaging.ts:130](src/lib/messaging.ts:130) : un membre ne peut pas bloquer quelqu'un ; personne ne peut retirer un message, pas même le formateur dans son propre groupe. Un membre harcelé par le formateur n'a que le signalement, ou le départ — en perdant ce qu'il a payé.

### Mineurs

| # | Constat | Où |
|---|---|---|
| a1 | Adresse du site : trois replis différents. Notifications et achats retombent sur `http://localhost:3000`, le rappel de suppression sur `https://nkamva.com` et ignore `WEB_BASE_URL` | [notification.ts:33](src/lib/notification.ts:33), [purchases.ts:94](src/lib/purchases.ts:94), [remind-pending-deletions.ts:35](src/lib/jobs/remind-pending-deletions.ts:35) |
| a2 | Formulaire de contact : sans `SUPPORT_EMAIL`, les messages partent vers `EMAIL_FROM` — l'adresse `noreply@` | [contact/route.ts:39](src/app/api/contact/route.ts:39) |
| a3 | `archiveCourse` ne journalise rien, alors que tous les autres gestes du formateur sur une ressource sont audités | [courses.ts:454](src/lib/courses.ts:454) |
| a4 | Taux de commission par formateur et par communauté en base, **sans aucun écrivain** : levier mort, toujours 15 %. Le renouvellement prend le taux courant, pas celui de l'adhésion | `schema.prisma` (TrainerProfile, Community) |
| a5 | Recherche du nom du titulaire mobile money : pays par défaut `CM` | [payout-methods.ts:85](src/lib/payout-methods.ts:85) |
| a6 | Tâches planifiées dans le processus Next (node-cron) : une tâche manquée pendant un redémarrage n'est pas rattrapée avant le lendemain ; deux instances la joueraient deux fois | [jobs.ts](src/lib/jobs.ts), [instrumentation.ts](src/instrumentation.ts) |
| a7 | Aucune préférence de notification ni désinscription des e-mails. Acceptable tant que tous sont transactionnels ; à prévoir avant le premier envoi d'information | — |
| a8 | Stripe : ni `checkout.session.expired` ni `payment_intent.payment_failed` ; un achat carte abandonné ne se clôt que par la réconciliation | [webhooks/stripe/route.ts](src/app/api/webhooks/stripe/route.ts) |
| a9 | Directs : 9 places sur scène, spectateurs sans plafond ; coût LiveKit et enregistrement non bornés par communauté | [lives.ts:70](src/lib/lives.ts:70) |
| a10 | Le super-administrateur est immuable par l'interface (bien) ; sa perte (départ, 2FA perdue) ne se répare que par script sur le serveur | [admins.ts:192](src/lib/admins.ts:192) |

### À arbitrer (choix de produit qui ouvrent un risque)

- **P1 — Un mois d'adhésion, des ressources à vie.** Arbitrage 48 : une adhésion qui a chevauché la liaison d'une ressource y donne accès pour toujours ([communities.ts:1137](src/lib/communities.ts:1137)). Payer un mois de communauté pour garder des ressources qui valent bien plus est un abus prévisible.
- **P2 — Retirable avant la fin de la fenêtre de contestation.** Une vente est retirable tout de suite ; un remboursement dans les 14 jours met alors le portefeuille en négatif (décision 13). Combiné à A2, un formateur malhonnête peut vendre, retirer, remplacer le fichier et disparaître.
- **P3 — « Téléchargé = non remboursable », même si le fichier est défectueux.** Seul l'administrateur peut passer outre ; à confronter à L5.
- **P4 — Formateur suspendu.** Que doit-il advenir de ses membres (A4) : gel de la facturation, résiliation, remboursement au prorata ?
- **P5 — Commission figée ou non.** Si un jour le taux varie par formateur (a4), dire s'il s'applique aux adhésions en cours.

---

## Catalogue des cas par rôle

Légende : ✅ couvert (vérifié dans le code), ❌ non couvert (constat ci-dessus), ⚠️ couvert en partie ou à éprouver.

### Visiteur

| Cas | État |
|---|---|
| Voit des pays et opérateurs que la plateforme ne sait pas encaisser | ✅ liste tirée de la configuration PawaPay ([markets.ts](src/lib/markets.ts)) |
| Fournisseur injoignable : l'accueil plante | ✅ repli vide, pas de liste périmée |
| Lit des CGU sans droit applicable ni éditeur identifié | ❌ L1 |
| Mineur qui s'inscrit | ❌ L3 |
| Formulaire de contact perdu | ⚠️ a2 (dépend de `SUPPORT_EMAIL`) |
| Énumère les comptes par l'inscription | ✅ réponse uniforme (finding 7 du pentest) |

### Apprenant

| Cas | État |
|---|---|
| Double clic, deux onglets, paiement instantané | ✅ corrigé (#52) |
| Paiement mobile money resté en attente, rappel perdu | ✅ réconciliation (M1) |
| Achète une ressource dont le fichier est ensuite remplacé | ❌ A2 |
| Conteste après téléchargement d'un fichier défectueux | ⚠️ P3, L5 |
| Remboursé depuis Stripe par le support | ❌ A8 |
| Membre d'un formateur suspendu, facturé chaque mois | ❌ A4 |
| Prix de la communauté multiplié sans avis | ❌ A6 |
| Harcelé en message privé | ❌ A12 |
| Filmé en direct sans le savoir | ❌ L4 |
| Perd l'accès à son adresse e-mail | ❌ A11 |
| Mot de passe réinitialisé : les autres sessions tombent | ✅ `sessionsValidAfter` |
| Compte jamais vérifié qui paie | ✅ refusé (M6) |
| Banni qui réadhère | ✅ refusé (M4) |
| Supprime son compte avec une adhésion active | ✅ fermée à la purge (M5) |

### Candidat formateur (`PENDING_TRAINER`)

| Cas | État |
|---|---|
| Pièces non déposées puis confirmées | ✅ `UPLOAD_NOT_FOUND` |
| Nom légal vide ou fait d'espaces | ✅ corrigé (m1) |
| Pièces d'identité conservées hors du Cameroun | ❌ L2 |
| Refusé : reçoit le motif lisible | ⚠️ motif saisi par l'admin, recopié tel quel ([trainer-applications.ts:631](src/lib/trainer-applications.ts:631)) |

### Formateur

| Cas | État |
|---|---|
| Vend, retire, remplace le fichier, disparaît | ❌ A2 + P2 |
| Fixe un prix de communauté démesuré | ❌ A5 |
| Supprime le fichier d'une ressource vendue | ✅ refusé (`COURSE_SOLD`) |
| Publie une ressource sans fichier | ✅ refusé (B2) |
| Perd téléphone et codes de secours | ❌ A9 |
| Change de numéro de retrait après une prise de contrôle (SIM swap) | ✅ 2FA, carence de 72 h, e-mail à l'ancienne adresse |
| Code TOTP rejoué | ✅ corrigé (M8) |
| Trois refus bloquent les retraits | ✅ corrigé (M7) |
| Règle en retard et se fait re-suspendre | ✅ corrigé (M2) |
| Lit « Motif : CONTENT_MISMATCH » | ✅ corrigé (A7) |
| Clique un lien de retrait échoué → page introuvable | ✅ corrigé (A1) |
| Veut fermer son compte avec 300 FCFA | ❌ A3 |
| Reçoit un chargeback après avoir retiré | ⚠️ portefeuille négatif suivi (`negativeSince`, alerte à 60 jours) ; recouvrement non automatisé |
| Ne peut pas retirer un message offensant de son groupe | ❌ A12 |

### Administrateur (Modération, Finances, Super-admin)

| Cas | État |
|---|---|
| Approuve des retraits sans second facteur | ⚠️ A10 (dépend du serveur) |
| Clique la notification d'un retrait à instruire → page introuvable | ✅ corrigé (A1) |
| Rembourse dans Stripe plutôt que dans NKAMVA | ❌ A8 |
| Achète ou adhère | ✅ refusé |
| Désactive le super-administrateur | ✅ refusé (`SUPER_ADMIN_IMMUTABLE`) |
| Seul super-admin indisponible | ⚠️ a10 |
| Lit un signalement « USER, motif SPAM » | ✅ corrigé (A7) |

### Exploitation

| Cas | État |
|---|---|
| Paiement simulé en production | ✅ verrouillé deux fois (`NODE_ENV` + `ALLOW_PAYMENT_SIMULATION`) |
| Webhook Stripe non signé | ✅ refusé hors simulation |
| Rappel PawaPay perdu | ✅ réconciliation (M1) ; PawaPay permet aussi de réémettre un rappel |
| Serveur arrêté à l'heure d'une tâche | ⚠️ a6 |
| Liens des e-mails vers localhost en production | ⚠️ a1 (si `WEB_BASE_URL` manque) |
| Build qui passe malgré une erreur de typage | ✅ corrigé (#53) |
| Plusieurs instances : plafonds de débit multipliés | ⚠️ connu (finding 6 du pentest), mono-instance aujourd'hui |

---

## Ce qui reste à éprouver en direct

Dès que Docker revient (ou sur le staging) :

1. A5 : créer une communauté à 2 147 483 648 FCFA.
2. A2 : vendre une ressource, remplacer son fichier, rouvrir l'achat de l'apprenant.
3. A1 (corrigé) : déclencher un échec de retrait et cliquer la notification, côté formateur et côté Finances, pour confirmer.
4. A3 : fermer un compte formateur avec un reliquat de 300 FCFA.
5. A8 : rembourser un paiement test depuis le tableau de bord Stripe.

## Sources externes

- Loi n° 2024/017 du 23 décembre 2024 sur les données personnelles : [Droit Médias Finance](https://droitmediasfinance.com/index.php/actualites/droit-tech-fintech/1297-cameroun-la-loi-sur-la-protection-des-donnees-a-caractere-personnel-entre-en-vigueur-ce-23-juin-2026), [CIO Mag](https://cio-mag.com/?p=59861), [Digital Business Africa](https://www.digitalbusiness.africa/cameroun-lautorite-de-protection-des-donnees-a-caractere-personnel-creee/)
- Loi n° 2010/021 sur le commerce électronique : [ministère du Commerce](https://www.mincommerce.gov.cm/sites/default/files/documents/loi-n-2010-021-du-21-decembre-2010-regissant-le-commerce-electronique-au-cameroun.pdf) (texte non consulté : site injoignable)
- Loi-cadre 2011/012 sur la protection du consommateur, délai de rétractation : [Memoire Online](https://www.memoireonline.com/04/15/9081/m_Les-contrats-d-adhesion-a-l-epreuve-de-la-loi-cadre-n2011012-du-06-mai-2011-portant-protection-d16.html)
- TVA sur les plateformes de commerce électronique : [Financial Afrik](https://financialafrik.com/2020/09/23/cameroun-entree-en-vigueur-de-la-taxe-sur-les-plateformes-numeriques), [Le Fisk](https://lefisk.cm/blog/tva-numerique-ecommerce-cameroun-article-23-bis-gafam), [Exposé des motifs LF 2026](https://www.dgb.cm/wp-content/uploads/2025/12/Expose-des-Motifs_LF-2026_fr.pdf)
- PawaPay, états d'un dépôt et réémission des rappels : [documentation](https://docs.pawapay.io/deposits), [mise en œuvre](https://docs.pawapay.io/implementation)
- Fraude au mobile money (SIM swap, prise de contrôle, détournement de versement) : [GSMA](https://www.gsma.com/about-us/regions/africa/gsma_resources/mitigating-common-fraud-risks-best-practices-for-the-mobile-money-industry/)

Les sources juridiques sont secondaires, sauf mention contraire : les points L2, L3 et L5 sont à faire confirmer par un juriste avant d'agir.
