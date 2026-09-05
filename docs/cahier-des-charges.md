# Cahier des charges — NkamVa

> **Nature du document.** Référence produit interne. Il décrit ce que la
> plateforme **doit** faire, pour qui, sous quelles règles et sous quelles
> contraintes techniques. Il ne remplace pas `docs/decisions-nkamva.md`, qui
> reste le **journal d'autorité des arbitrages** : ce cahier en est la mise en
> forme structurée, augmentée de ce que le code impose et de ce qui reste à
> faire.
>
> **Établi le 19 août 2026**, dérivé de l'état réel du dépôt (branche
> `develop`, commit `a91b7fe`) : 1 866 lignes de schéma Prisma, 128 routes API,
> 84 pages, 80 modules de service, 57 fichiers de test, 24 tâches planifiées.
>
> **Révisé le 4 septembre 2026**, après l'audit fonctionnel du 1er septembre
> mené sur `develop`. Neuf décisions y ont été prises ; elles touchent F1
> (reprise de l'action), F3 (durée mesurée, association à une communauté
> ouverte, consultation d'une ressource achetée), F5 (lecture d'un lien
> partageable), F7 (historique des ventes), F12 (e-mails et préférences),
> §10.1 (budget par route), §13 et §14. Trois d'entre elles ne font que
> réaffirmer une règle déjà écrite mais jamais implémentée.
>
> **Complété le 4 septembre 2026** par les arbitrages 126-130 — la messagerie
> unifiée : le fil collectif d'une communauté devient un **groupe** de la
> messagerie, le mot « salon » est retiré du produit, et l'annonce devient un
> message épinglé qui notifie. Touche F5, F12, §4.2, §7, §13, §14 et le
> glossaire.
>
> **Hiérarchie des sources en cas de divergence** : le code du dépôt, puis
> `docs/decisions-nkamva.md`, puis ce document, puis les autres documents
> `docs/`. Une divergence constatée est un défaut à corriger, pas une
> interprétation à trancher au cas par cas.

## Sommaire

1. [Objet et cadre](#1-objet-et-cadre)
2. [Le produit](#2-le-produit)
3. [Acteurs et rôles](#3-acteurs-et-rôles)
4. [Périmètre](#4-périmètre)
5. [Exigences fonctionnelles](#5-exigences-fonctionnelles)
6. [Règles métier transverses et invariants](#6-règles-métier-transverses-et-invariants)
7. [Modèle de données](#7-modèle-de-données)
8. [Architecture et conventions techniques](#8-architecture-et-conventions-techniques)
9. [Intégrations externes](#9-intégrations-externes)
10. [Exigences non fonctionnelles](#10-exigences-non-fonctionnelles)
11. [Conformité, juridique et fiscal](#11-conformité-juridique-et-fiscal)
12. [Qualité et recette](#12-qualité-et-recette)
13. [État d'avancement et reste à faire](#13-état-davancement-et-reste-à-faire)
14. [Risques et points non arbitrés](#14-risques-et-points-non-arbitrés)
15. [Annexes](#15-annexes)

---

## 1. Objet et cadre

### 1.1 Objet

NkamVa est une plateforme de formation en ligne pour l'Afrique francophone, où
des **formateurs** vendent des ressources pédagogiques à l'unité, animent des
**communautés** payantes par abonnement et y tiennent des **sessions en direct**
enregistrées. La plateforme encaisse pour le compte des formateurs, prélève une
commission, et reverse le solde sur demande après vérification d'identité.

Ce cahier des charges couvre l'intégralité du produit : les trois espaces
(visiteur, apprenant/formateur, administration), les flux financiers, les
obligations réglementaires identifiées, et les contraintes d'exécution sur
téléphone d'entrée de gamme.

### 1.2 À qui il s'adresse

Aux personnes qui écrivent le code, arbitrent le produit ou instruisent les
dossiers. Il suppose la lecture de `docs/decisions-nkamva.md` pour le
*pourquoi* de chaque règle ; il en donne ici le *quoi*.

### 1.3 Documents liés

| Document | Ce qu'il porte |
|---|---|
| `docs/decisions-nkamva.md` | Les 132 arbitrages produit, avec leur statut d'implémentation |
| `docs/abonnement-formateur.md` | Les 19 arbitrages du cycle de vie de l'abonnement formateur (A1-A19) |
| `docs/invitations.md` | Spécification complète des invitations aux communautés |
| `docs/registre-des-traitements.md` | Registre des traitements de données personnelles |
| `docs/a-valider-par-un-conseil.md` | Ce qui bloque une mise en ligne publique, par interlocuteur (juriste, comptable, conseil financier) |
| `docs/mobile-first-analyse.md` et `-implementation.md` | Le chantier mobile : constat mesuré et liste de tâches |
| `docs/lot0-socle.md` à `lot4-parcours-coeur.md` | Spécifications de lot, historiques |
| `docs/recommandations-modelisation.md` | Propositions de modélisation **non validées** |

---

## 2. Le produit

### 2.1 Proposition de valeur

- **Pour l'apprenant** : acheter une ressource à l'unité, ou adhérer à la
  communauté d'un formateur pour accéder à ses ressources incluses, à ses lives
  et à ses replays — en payant par **mobile money** ou par carte.
- **Pour le formateur** : publier, vendre, animer et se faire payer sans monter
  d'infrastructure, contre **15 % de commission** et un abonnement de
  plateforme.
- **Pour NkamVa** : une commission sur chaque vente, un abonnement formateur à
  deux cadences, et la vente d'extensions de stockage.

### 2.2 Modèle économique

| Source | Règle | Référence |
|---|---|---|
| Commission | **15 %** du prix payé, prélevée à la vente ; le formateur est crédité de **85 %**. Taux porté par formateur (`TrainerProfile.commissionRate`, défaut 0,15) et **figé sur chaque achat** | Arbitrage 11 |
| Abonnement formateur | Un seul abonnement de plateforme, **deux cadences** (mensuelle, annuelle) aux droits identiques. Peut valoir **zéro** (gratuité de lancement, bornée au 31 décembre 2026, préavis de 60 jours) | Arbitrages 49, 56, 96 |
| Stockage | **40 Go inclus**, extension par tranches de **50 Go** à **3 000 FCFA/mois** ou **30 000 FCFA/an**, facturée à la cadence de l'abonnement | Arbitrages 54, 69, 95 |
| Adhésion communauté | Prix **unique** fixé par le formateur (`Community.priceFcfa`), encaissé par la plateforme, commissionné comme une vente | Arbitrage 58 |

Aucun montant n'est écrit deux fois : l'abonnement passe par `lib/pricing.ts`,
la commission par `lib/commission.ts`, le stockage par `lib/storage-tiers.ts`.
Un écran qui affiche un montant le lit à la source.

### 2.3 Marchés et devises

La référence de facturation est le **FCFA (XAF)**, en entiers. Un pays n'est
annoncé sur la vitrine que s'il est **payable le jour même** : distribué par le
compte PawaPay **et** doté d'une devise dont le taux est administré (ou à
parité fixe avec le FCFA). La liste est calculée par `lib/markets.ts` depuis
`/v2/active-conf` — elle n'est jamais écrite à la main. Si le fournisseur est
injoignable, la vitrine n'annonce **rien** plutôt qu'une liste périmée.

---

## 3. Acteurs et rôles

### 3.1 Les rôles

| Rôle | Enum | Ce qu'il peut |
|---|---|---|
| **Visiteur** | — | Parcourt la vitrine, le catalogue, l'annuaire des formateurs et des communautés publiques. Ne peut ni acheter ni adhérer. |
| **Apprenant** | `LEARNER` | Achète des ressources, adhère à des communautés, participe aux lives, ouvre des litiges, signale, gère son compte. |
| **Candidat formateur** | `PENDING_TRAINER` | A déposé une candidature ; conserve tous les droits d'apprenant. |
| **Formateur** | `TRAINER` | Publie et vend, anime une communauté et des lives, gère son portefeuille et ses retraits. **Garde tous les privilèges de l'apprenant** (arbitrage 89). |
| **Administrateur** | `ADMIN` + `adminRole` | Voir 3.2. **N'achète rien, n'adhère à rien, ne candidate pas** (arbitrages 87-88). |

### 3.2 Les trois sous-rôles d'administration

| Sous-rôle | Périmètre | Interdits |
|---|---|---|
| `SUPER_ADMIN` | Tout : équipe, configuration, tarification, journal d'audit, escalades, réconciliation de portefeuille, sanction `BANNED` | — |
| `FINANCES` | Transactions, retraits, moyens de paiement, remboursements, abonnements, remises, registre des remises, rapports. **Lecture seule** sur les utilisateurs | Aucun accès à la modération, ni à l'image d'une pièce d'identité |
| `MODERATION` | Signalements, modération des ressources et des interactions, validation des formateurs et de leurs documents, sanction `RESTRICTED` | Aucun accès aux finances ni aux moyens de paiement |

Le **journal d'audit** est lisible par le seul Super-admin, mais **toutes** les
actions des trois rôles y sont écrites. Il n'expose aucune action de
modification : un journal qu'on peut retoucher ne prouve rien.

### 3.3 Cloisonnement — règles opposables

1. Un administrateur ne peut ni acheter, ni adhérer, ni accepter une
   invitation, ni candidater (arbitrage 87).
2. On ne **promeut** pas un compte existant : `createAdmin` refuse une adresse
   déjà connue ; un administrateur se crée sur une adresse dédiée.
3. On ne **rétrograde** pas : un administrateur qui part voit son compte
   **fermé** (`suspendedAt` posé, `role` et `adminRole` conservés).
4. On ne change **jamais** le rôle d'un compte depuis l'administration : les
   seules transitions sont créer, désactiver, réactiver (arbitrage 106).
5. La garde vit **dans l'API et dans les pages** : une page interdite redirige
   avec un motif, elle ne laisse pas cliquer un bouton qui échouera.

---

## 4. Périmètre

### 4.1 Dans le périmètre

Vitrine publique · catalogue et recherche · achat à l'unité · communautés par
abonnement · invitations · sessions en direct et replays · messagerie ·
candidature formateur et vérification documentaire · portefeuille, KYC et
retraits · litiges, remboursements et chargebacks · abonnement formateur et
stockage · signalements et sanctions · administration à trois sous-rôles ·
notifications et préavis · conformité des données personnelles · mobile first.

### 4.2 Hors périmètre — décisions explicites

| Exclu | Décision |
|---|---|
| **Mode école** (Quiz, Certificate, Lesson) | Arbitrage 4 — aucun modèle, aucun écran |
| **Onboarding apprenant dédié** | Arbitrage 6 — la recherche est intégrée au catalogue |
| **SMS** | Arbitrage 100 — aucun provider ne sera intégré ; l'e-mail et la notification in-app sont le canal d'alerte |
| **Micro-virement IBAN** | Arbitrage 99 — vérification sur pièce, en revue manuelle Finances |
| **Paliers d'abonnement `STARTER` / `PRO` / `EXPERT`** | Arbitrage 66 — remplacés par deux cadences |
| **Jauge de places d'un live** | Arbitrage 46 — la communauté est sa propre limite |
| **Multilingue** | Monolingue français ; `next-intl` présent mais non utilisé |
| **WebSocket** | Temps réel par sondage TanStack Query — 8 s sur un fil, 15 s sur une liste, **pour les deux formes de conversation**. Un groupe ne change pas la cadence mais la charge : le fil se sonde en **incrémental** (`?depuis=`), et tout sondage **cesse quand l'onglet est masqué** (arbitrage 131) |
| **Optimisation mobile de l'administration** | Arbitrage 109 — les 24 écrans `/admin` héritent du socle, rien de plus |
| **Contrepartie du parrain** | Arbitrage 76, ajourné ; si elle arrive, financée sur la commission NkamVa (arbitrage 104) |
| **Refusion des espaces visiteur / connecté** | Décision assumée : deux arborescences, décrites dans `src/lib/spaces.ts` |
| **Repli sur des données en dur** | Une base vide produit un état vide, jamais des cartes de démonstration qui mènent à un 404 |

---

## 5. Exigences fonctionnelles

Chaque domaine décrit **ce que le produit doit faire**, les **règles opposables**
et les **refus attendus**. Les codes en `SCREAMING_SNAKE_CASE` sont les codes
d'erreur retournés par l'API.

### F1 — Comptes, authentification, sécurité

**Ce que le produit doit faire**

- Inscription par e-mail et mot de passe, **vérification par code à usage unique
  (OTP)** envoyé par courriel. Aucun compte actif sans adresse vérifiée.
- Connexion, déconnexion, réinitialisation de mot de passe, changement de mot de
  passe.
- **Double authentification** (TOTP) optionnelle, avec codes de récupération.
- Profil : identité affichée, avatar, préférences de notification.
- **Export des données personnelles** et **suppression de compte** à la demande.
- **Reprendre l'action que l'authentification a interrompue**, sans la refaire.

**Règles opposables**

1. Mot de passe haché en **argon2id**. Aucune validation HTML native : les
   règles vivent dans `src/lib/validation.ts`, et les formulaires portent
   `noValidate`.
2. Invalidation ciblée des sessions par `User.sessionsValidAfter` — bumpée à
   chaque transition de rôle, sanction, ou changement de mot de passe.
3. La suppression de compte est **refusée** tant qu'une situation reste ouverte
   au nom de la personne (arbitrage 90) :

   | Refus | Ce qu'il protège |
   |---|---|
   | `ADMIN_ACCOUNT` | La redevabilité — un administrateur ne s'efface pas lui-même |
   | `WALLET_NOT_EMPTY` | L'argent du formateur, qu'il doit se faire verser |
   | `PAYOUT_IN_FLIGHT` | Le retrait débité mais pas encore versé |
   | `PUBLISHED_COURSES` | L'acheteur d'une ressource dont l'auteur disparaîtrait |
   | `ACTIVE_COMMUNITY` | Les membres qui paient encore |
   | `OPEN_DISPUTE` | L'autre partie et l'administrateur qui instruit — vaut **aussi** côté acheteur |

4. La suppression acceptée est **différée** : rappel programmé, puis purge par
   tâche planifiée (`PENDING_DELETION_REMINDER`, `DELETED_ACCOUNT_PURGE`).
5. L'âge minimum de 16 ans est **déclaratif** — signalé comme tel au §11.
6. **Reprise de l'action interrompue.** Une action engagée sans compte — acheter,
   adhérer, accepter une invitation, ouvrir une ressource — est **reprise
   automatiquement** une fois l'authentification faite. La destination voyage
   dans `callbackUrl` et **traverse toute la chaîne** : inscription →
   vérification par code → connexion. Aucune étape n'a le droit de la laisser
   tomber ; le point d'arrivée par défaut (`/accueil`) n'est qu'un repli.

   La destination vient de l'URL, donc de n'importe qui : elle est **validée par
   un garde-fou unique et partagé** avant d'être suivie — chemin interne
   uniquement, jamais une origine externe. Un `callbackUrl` refusé retombe sur
   le repli, il ne provoque pas d'erreur.

   Cette règle généralise ce que F5 imposait déjà au seul cas de l'invitation,
   où l'adresse invitée est préremplie et verrouillée à l'inscription.

### F2 — Devenir formateur

**Parcours** — inscription légère → candidature (pièce d'identité + diplôme +
vidéo de présentation) → instruction par la Modération → **règlement du premier
abonnement** → ouverture de l'espace formateur. Le RIB n'est **jamais** demandé
à ce stade : il n'est utile qu'au premier retrait (arbitrage 3).

**Règles opposables**

1. **Le paiement fait le formateur.** Une candidature approuvée n'ouvre pas
   l'espace : elle ouvre le **droit de payer**. Le `TrainerProfile`, le
   portefeuille et le rôle `TRAINER` ne naissent qu'au **retour signé du
   fournisseur de paiement**. Il n'existe donc aucun état « formateur qui n'a
   jamais payé ». Exception : si le tarif en vigueur vaut zéro, l'activation est
   immédiate et la ligne d'échéance est marquée `WAIVED`.
2. Le paiement d'activation emprunte **la même porte** que les achats
   (`openProviderPayment`) : aucun second chemin vers Stripe ou PawaPay.
3. Machines à états : candidature `DRAFT → SUBMITTED → APPROVED | REJECTED |
   RESUBMISSION_PENDING` (T1-T8) ; document `AWAITING_UPLOAD → PENDING →
   APPROVED | REJECTED | RESUBMITTED` (D0-D7).
4. À l'approbation de la pièce d'identité, la Modération **saisit et confirme**
   `TrainerProfile.verifiedLegalName`. Ce champ survit à la candidature — il est
   porté par le profil, pas par le dossier.
5. Les **documents d'identité sont purgés 90 jours** après la décision. Une fois
   purgés, la réouverture du dossier est impossible : `REOPEN_IMPOSSIBLE`.
6. Le contrôle de concurrence est **optimiste** : chaque transition sensible
   porte `expectedUpdatedAt`, et répond `STALE_*` en 409 si le dossier a bougé.

**Retour d'un ancien formateur** (A7) — réactivation possible, **pièces
revérifiées**. Un dossier ancien ne vaut pas preuve d'aujourd'hui.

### F3 — Ressources : création, publication, catalogue, consultation

**Ce que le produit doit faire**

- Créer une ressource (titre, description, catégorie, niveau, format, prix,
  couverture), téléverser son contenu, la publier, l'archiver.
- La rendre découvrable : catalogue filtrable (catégorie, format, niveau, prix),
  recherche transversale, fiches publiques et connectées, favoris.
- **La donner à consulter** une fois achetée, en gardant la position atteinte.

**Règles opposables**

1. **Deux circuits exclusifs** (arbitrages 45, 47) : une ressource est **soit**
   `MARKETPLACE` (vendue à l'unité, y compris aux membres de la communauté de
   son auteur), **soit** `COMMUNITY` (incluse, gratuite pour les membres).
   Jamais les deux.
2. **Bascule à sens unique** (arbitrage 53) : vendue → incluse est autorisé ;
   incluse → vendue est **interdit**. Ce qui a été annoncé comme inclus ne
   repasse jamais derrière un paywall.
3. **Déliaison** (arbitrage 48) : retirer une ressource de la communauté la
   masque aux futurs membres, mais **tout membre qui y avait accès le conserve**.
4. **Téléversement** : URL **pré-signée en direct** vers le stockage objet,
   jamais de proxy applicatif. Liste blanche de types, plafonds par genre —
   vidéo 2 Go, archive (zip, rar) 2 Go, PDF 10 Mo, images 5 Mo. Le contenu des
   archives n'est **pas** inspecté : l'extension fait foi.
5. Un formateur ne peut pas **acheter sa propre ressource**.
6. La publication est refusée si l'abonnement du formateur n'est pas en règle
   (voir F9) ou si le quota de stockage est dépassé.
7. Le dépassement de quota **bloque le téléversement** et **ne supprime rien** :
   aucun contenu en ligne ne disparaît pour une raison de facturation
   (arbitrage 54).
8. **Ce qui est vérifiable est mesuré, pas déclaré.** La **durée d'une vidéo**
   est lue sur l'objet téléversé, à la confirmation du téléversement, au même
   endroit et pour la même raison que sa taille : un chiffre que le formateur
   saisit lui-même n'engage rien et ne peut contredire personne. Elle n'est
   donc **plus un champ du formulaire**.

   La lecture se fait par intervalles sur l'objet, sans le rapatrier. Si elle
   échoue, la durée reste **vide** et **la publication n'est pas bloquée** :
   une métadonnée illisible ne vaut pas une vente refusée.

   Le **nombre de sessions annoncé disparaît**. Une ressource est un fichier
   unique, le mode école est hors périmètre (arbitrage 4), et rien dans le
   système ne peut confronter ce nombre au contenu réel : c'est exactement
   l'incohérence qu'un fichier « à une session » déposé sous une annonce « deux
   sessions » a laissé passer.
9. Le **format d'une ressource est identifiable sans l'ouvrir**, dans le
   catalogue comme dans l'espace de l'acheteur — une vidéo se reconnaît à sa
   vignette et à son libellé, pas en cliquant.
10. **On n'associe une ressource qu'à une communauté ouverte.** *Ouverte* et
    *visible* sont deux choses (arbitrage 81) : `status` dit que la communauté
    **vit**, `visibility` dit qu'on peut la **trouver**. Une communauté privée
    reste ouverte — elle est fermée au public, pas close. Le contrôle porte donc
    sur `status`, jamais sur la visibilité : un formateur qui met sa communauté
    en privé continue d'y inclure des ressources.

    La règle est **bornée à l'instant de l'association**, et elle l'est par la
    règle 2 : la bascule vendue → incluse étant à sens unique, une ressource
    déjà incluse ne peut pas retourner au catalogue si la communauté ferme
    ensuite. Ce que devient une ressource incluse quand sa communauté se ferme
    (F9.9) **n'est pas arbitré** : voir §14.
11. **Une ressource incluse dit à quelle communauté elle appartient.** Dans
    l'espace de l'acheteur, elle porte un lien qui **ouvre directement** cette
    communauté. « Mes communautés » reste la vue dédiée — elle ne doit
    simplement plus être le seul endroit d'où l'on retrouve une communauté liée
    à une ressource.

**Consultation d'une ressource achetée**

L'accès est à vie ; il doit aussi être **repris là où il s'est arrêté**. Une
ressource longue se consulte en plusieurs fois, souvent depuis un téléphone,
souvent sur une connexion qui se coupe.

1. **La position est enregistrée, et elle est réelle.** Ce n'est pas un
   pourcentage estimé : c'est **une seconde** pour une vidéo, **une page** pour
   un document. Elle est sauvegardée pendant la consultation, et au plus tard
   quand l'onglet est masqué ou fermé — on ne perd pas ce qui a été lu parce que
   la personne a fermé son navigateur.
2. **Toute ressource lisible en ligne est lue en ligne, dans son format.** Un
   document n'est pas rendu par un lecteur vidéo : chaque format a le rendu qui
   lui correspond, faute de quoi l'écran est vide et rien n'est mesuré. Le
   visualiseur nécessaire est chargé **sur la seule route de lecture**, aux
   conditions du §10.1.
3. **Ce qui ne se rend pas en ligne se marque.** Les archives — kit, tableur,
   modèle — n'ont pas de position possible : elles portent un marqueur
   **ouvert / terminé** que l'apprenant pose lui-même, et le téléchargement les
   compte comme consultées.
4. **La reprise vaut sur tous les appareils** : elle est portée par le compte,
   pas par le navigateur. Fermer l'onglet, se déconnecter, changer de téléphone
   ne la perdent pas.
5. La **progression affichée** se dérive de cette position. Quand la longueur de
   la ressource est inconnue, on affiche l'avancement **sans pourcentage**
   plutôt qu'un zéro trompeur : un anneau à 0 % sur une ressource lue à moitié
   fait croire que rien n'a été enregistré.
6. Cette position est **la même donnée** que celle qui alimente le seuil de
   consommation des litiges (F8.1) : il n'en existe pas deux.

### F4 — Achat et paiement

**Parcours** — fiche ressource → tunnel d'achat → choix du moyen (carte ou
mobile money) → paiement chez le fournisseur → retour → confirmation.

**Règles opposables**

1. **Rien n'est ouvert avant que le paiement soit confirmé.** L'accès, le crédit
   du portefeuille et la facture naissent **du webhook signé**, jamais du retour
   navigateur.
2. Le crédit du portefeuille est **idempotent** : `updateMany` filtrant sur
   `providerStatus = PENDING`. Un webhook rejoué ne crédite pas deux fois ; un
   payload malformé est rejeté sans effet de bord.
3. **Carte** : Stripe Checkout **hébergé** — aucune donnée de carte ne transite
   par NkamVa. L'identifiant de transaction passe de `cs_…` à `pi_…` en cours de
   paiement ; **une session abandonnée ne se reprend pas**, on en ouvre une
   nouvelle.
4. **Mobile money** : PawaPay. Le numéro est **ressaisi à chaque paiement**
   (A16) — il n'est pas conservé comme moyen de paiement.
5. Les **devises** sont administrées (`FxRate`) ; un marché sans taux n'est pas
   proposé (`FX_RATE_MISSING`). Le même taux sert à encaisser et à reverser —
   le *spread* n'est pas couvert par une majoration du taux (voir §14).
6. Chaque paiement réussi produit une **facture** numérotée (`Invoice`,
   `InvoiceCounter`), consultable dans « Mes factures ».
7. Sur la confirmation d'achat uniquement, la sobriété réseau est levée :
   vérification immédiate au retour de focus, sondage porté à **300 s**
   (arbitrage 115) — une saisie de code USSD dépasse couramment deux minutes.

### F5 — Communautés, adhésions, invitations

**Ce que le produit doit faire**

- Un formateur anime **une** communauté : présentation, couverture, prix
  d'adhésion, visibilité, ressources incluses, fil de publications, membres.
- Un apprenant adhère, participe au fil, échange en messagerie, assiste aux
  lives, résilie, se réabonne.

**Règles opposables**

1. **Visibilité** : `PUBLIC` ou `PRIVATE`. Une communauté privée sort de
   l'annuaire, de la recherche, de la fiche formateur, et sa page publique
   répond **404** — un 403 révélerait son existence. Basculer en privé
   **révoque, dans la même transaction, les liens partageables en circulation** ;
   les membres déjà entrés restent membres (arbitrages 74, 81).
2. **Périmètre de la messagerie** : un apprenant n'échange avec un formateur que
   s'il est **membre** de sa communauté. Un achat à l'unité n'ouvre aucun droit
   de conversation. À la fin de l'adhésion, l'écriture cesse mais **le fil reste
   lisible** (arbitrages 33, 39).
2 bis. **Le fil collectif d'une communauté est un groupe de la messagerie**
   (arbitrage 126). Flux plat, auteur nommé sur chaque message, listé avec les
   conversations privées — un membre ne jongle pas entre deux écrans pour suivre
   ce qui se dit. Le mot **« salon » n'est plus employé** : *communauté* pour
   l'entité payante, *groupe* pour le fil collectif (arbitrage 127).

   Un **ancien membre lit le groupe sans y écrire** (arbitrage 129), comme il
   garde son fil privé lisible. C'est la même règle, appliquée aux deux.

   Le reste des droits d'écriture est celui du fil privé : un membre banni de la
   communauté et un compte restreint lisent sans écrire ; le formateur garde la
   parole en toutes circonstances (arbitrages 40, 63).
3. **Accès après résiliation** (arbitrage 34) : le membre sortant conserve les
   replays et les ressources **intégrés pendant son adhésion**. Pour un replay,
   **c'est la date du live qui fait foi**, pas celle de la mise en ligne.
4. **Réabonnement — rattrapage complet** (arbitrage 44) : l'ancien membre qui
   revient récupère tout ce qui a été ajouté pendant son absence. Aucun trou.
5. **Invitations** (arbitrages 71-86) :

   | Attribut | Valeurs | Règle |
   |---|---|---|
   | Forme (`kind`) | `NOMINATIVE`, `SHARE_LINK` | Le lien partageable n'entre **jamais** dans une communauté privée |
   | Nature (`grant`) | `GIFT`, `PAID` | **La gratuité est nominative, toujours**, et à usage unique |
   | Émetteur | Formateur, membre actif | Le formateur émet les deux formes et fixe la durée offerte (1 à 3 mois) ; le membre n'émet que le lien payant |

   - Une invitation payante ne se consomme **qu'au paiement confirmé**.
   - Une adhésion offerte **ne se reconduit pas** : au terme, elle se ferme
     comme une résiliation, sans `PAST_DUE`.
   - Une invitation **ne blanchit rien** : refusée à un compte banni de la
     communauté, sanctionné, suspendu, et au formateur lui-même.
   - Une invitation **ne crée pas de compte** et **ne vaut pas** vérification
     d'adresse : l'invité s'inscrit et vérifie par OTP comme tout le monde.
     L'adresse invitée est **préremplie et verrouillée** à l'inscription — le
     refus reste côté serveur (`INVITATION_EMAIL_MISMATCH`).
   - Un jeton invalide (inconnu, expiré, révoqué, épuisé) renvoie **le même
     message générique**, sans nom de communauté ni de formateur. Seule
     exception : l'adresse discordante est signalée, masquée (`j••••@exemple.com`).
   - Le formateur ne voit **qu'un statut d'invitation**, jamais un statut de
     personne — sans quoi sa liste devient une sonde d'énumération d'adresses.
   - **Les deux formes ne se lisent pas de la même façon.** Une invitation
     **nominative** est à usage unique : elle a un statut binaire, en attente ou
     acceptée. Un **lien partageable** est multi-usage par conception — jusqu'à
     25 acceptations sur 90 jours glissants — et n'a donc pas de statut
     « accepté » : il affiche un **compteur d'usages** (`n / maximum`), et ne
     devient terminal qu'épuisé, expiré ou révoqué. Lui appliquer la pastille
     binaire le laisse indéfiniment « en attente » alors que des membres sont
     entrés, ce qui est faux et ce que le formateur lit comme une panne.
     Conséquence de vocabulaire : le filtre qui réunit ce qui peut encore faire
     entrer quelqu'un s'appelle **« actives »**, pas « en attente » — un lien à
     sa septième entrée n'attend rien. Il gouverne aussi le compte porté par
     l'onglet *Invitations*.
   - **La liste se rafraîchit seule, toutes les 15 secondes** (§4.2). Une
     invitation change d'état sans que le formateur touche à rien : quelqu'un
     accepte, un lien atteint son quota, une échéance passe. Sans cela l'écran
     reste figé sur ce qu'il montrait à l'ouverture, et la pastille corrigée ne
     sert à rien. Onglet masqué, le sondage s'arrête (règle 11 du §10.2).
   - Toute notification touchant une invitation renvoie vers **l'écran qui la
     porte réellement** — le panneau d'invitations de la communauté. Une
     notification qui pointe une route inexistante est un défaut, pas un détail
     de libellé.
   - L'adresse invitée est une donnée personnelle : **rétention 90 jours** après
     l'état terminal, purge planifiée, aucun usage marketing, présence dans
     l'export de données des deux côtés.
   - Quotas : **20 invitations offertes** par communauté et par 30 jours
     glissants, **25 acceptations / 90 jours** pour un lien partageable. Ce sont
     des **limites de dégât** portées par `Setting`, modifiables par le
     Super-admin, **non annoncées** comme une caractéristique de l'offre.

### F6 — Sessions en direct et replays

**Règles opposables**

1. Un live appartient à une **communauté**, jamais à une ressource
   (arbitrage 32).
2. **C'est une visioconférence, pas une diffusion** : tout le monde peut parler.
   La main levée ne conditionne rien, elle **signale** — les demandes sont
   **ordonnées et numérotées**, et l'interface indique le locuteur actif
   (arbitrages 31, 36, 37).
3. **La salle n'a pas de jauge, la scène a un plafond** : **9 publieurs vidéo
   simultanés** au maximum, plafond **technique et global**, jamais affiché
   comme un nombre de places. Le reste de la salle est en audio et en réception
   (arbitrage 93).
4. Le formateur **modère la parole** : couper un micro, plusieurs, tous, et les
   rouvrir. Il ne peut **pas exclure** de la session en cours — écarter
   durablement relève du bannissement de la communauté (arbitrages 35, 40).
   Un participant coupé n'a qu'un canal pour redemander la parole : lever la
   main (arbitrage 41).
5. **Tout live est enregistré**, sans décision au lancement : un replay existe
   systématiquement (arbitrage 38). L'egress écrit **directement dans le
   stockage objet**, en une définition unique (800 kbit/s à 1,5 Mbit/s) plus une
   **variante audio seule** pour les connexions faibles (arbitrage 94).
6. **Rétention 24 mois** après la date du live, puis purge. Le formateur est
   **prévenu 30 jours avant** — le préavis long existe parce que récupérer
   plusieurs gigaoctets est un geste coûteux (arbitrages 51, 103).
7. Le **salon de discussion** de la séance est conservé et rattaché au replay
   (arbitrage 42).
8. **Tout membre peut télécharger** les replays auxquels il a accès : ni droit
   de formule, ni réglage par session (arbitrage 55).
9. Horodatage **UTC en base**, fuseau IANA déclaré sur la séance, affichage dans
   le fuseau du lecteur (arbitrage 107).

### F7 — Portefeuille, ventes, KYC et retraits

**Score KYC** (arbitrage 1) — sur 100 :

| Critère | Points |
|---|---|
| Pièce d'identité vérifiée | 40 |
| Moyen de versement vérifié | 30 |
| Ancienneté ≥ 30 jours | 10 |
| ≥ 3 ventes réglées sans litige | 10 |
| Aucun litige ouvert *(exige au moins une vente réglée)* | 10 |

Seuils : **≥ 80 « Vérifié »**, 50-79 « À vérifier », < 50 « Non vérifié ».

**Règles opposables**

1. **Le premier retrait est toujours en revue manuelle Finances**, quel que soit
   le score (arbitrage 25). L'auto-approbation à ≥ 80 ne vaut qu'à partir du
   deuxième.
2. **Aucune vérification purement déclarative.** Un moyen de versement non
   vérifié vaut **0 point**, jamais un score partiel. `AUTO_VERIFIED` n'est
   atteignable que sur une correspondance renvoyée par une **vraie API
   opérateur** — comparer localement le nom déclaré au nom vérifié ne prouve
   rien.
3. **Un seul moyen de versement actif** par formateur ; l'ajout d'un nouveau
   archive le précédent, qui reste consultable pour l'audit.
4. **Carence de 72 h** après ajout ou modification, même si la vérification a
   abouti plus tôt. Pendant la carence, le moyen vaut 0 point.
5. **SLA de revue : 48 heures calendaires** (arbitrage 101).
6. **Trois soumissions rejetées** au maximum, puis blocage et **escalade
   Super-admin**. Le compteur vit sur le **formateur**, pas sur le moyen de
   paiement : l'archivage ne le remet pas à zéro.
7. **Deux natures de compte, exclusives** : `INDIVIDUAL` (le titulaire doit
   correspondre au nom légal vérifié — aucun compte de tiers, quel que soit le
   lien de parenté), `BUSINESS` (entité juridique, immatriculation exigée, le
   nom légal vérifié doit y figurer comme représentant). **Aucune
   auto-déclaration** du type « ce compte m'appartient ».
8. Un **écart de nom** produit un message explicite — jamais un rejet opaque —
   rappelant les deux options légitimes, **sans jamais afficher le nom légal
   vérifié en entier**. Finances ne tranche pas seul : escalade Super-admin.
9. L'écran d'ajout affiche **la règle avant le formulaire**, et le choix
   `INDIVIDUAL` / `BUSINESS` conditionne le formulaire.
10. Le **snapshot KYC est figé à la demande** de retrait : c'est lui qui a
    décidé de la voie suivie, la décision doit rester auditable même si le
    formateur évolue ensuite.
11. **Le formateur dispose d'un historique de ses ventes, ligne à ligne.** Un
    solde global ne dit pas d'où vient l'argent : il faut, pour **chaque vente**,
    ce qui a été vendu, la date, le **montant brut**, la **commission retenue**,
    le **montant net revenant au formateur** et le **statut** — encaissée,
    remboursée, contestée, accès suspendu.

    Les montants sont **lus à leur source** (`lib/commission.ts`), jamais
    recopiés dans l'écran, et ce sont les valeurs **figées sur l'achat** qui
    font foi : un taux de commission qui évolue ne réécrit pas le passé.

    Le partage doit être **lisible et cohérent avec la règle affichée** au §2.2.
    Un formateur qui voit 1 700 FCFA arriver sur une vente à 2 000 doit pouvoir
    retrouver les 300 retenus, nommés, sans les calculer lui-même.

**États d'un retrait** : `PENDING → AUTO_APPROVED | IN_REVIEW → APPROVED |
REJECTED → PAID | FAILED`, avec réouverture réservée au Super-admin.

### F8 — Litiges, remboursements, chargebacks

**Règles opposables**

1. **Éligibilité** : ouverture possible jusqu'au **14e jour inclus** après
   l'achat. Pour un format **streamé**, la règle des **30 % consultés**
   s'applique. Pour un format **téléchargeable**, le contenu téléchargé est
   réputé consommé à 100 % et la règle automatique **ne s'applique pas** : la
   demande passe en **décision manuelle du support** (arbitrages 2, 14, 18).
2. Un **snapshot de consommation** est figé à l'ouverture.
3. **L'accès est suspendu dès l'ouverture** et rétabli si le litige est rejeté.
4. **Réservation des fonds** : à l'ouverture, la part formateur passe en solde
   **réservé**, exclue du retirable (`FundReservation` `ACTIVE`). Rejet ou
   expiration → `RELEASED` ; remboursement → `DEBITED` ou `PARTIALLY_DEBITED`.
5. **Remboursement partiel au prorata** : NkamVa rend sa commission
   proportionnellement, le formateur est débité de 85 % du montant remboursé.
   Pas d'absorption unilatérale (arbitrage 12).
6. **Aucun double débit** : un litige manuel est refusé si un chargeback est
   actif sur la même vente (`DISPUTE_ALREADY_ACTIVE`) ; un chargeback qui arrive
   après un remboursement déjà accordé est **contesté automatiquement** auprès
   du fournisseur, avec preuve, et alerte Finances (`DOUBLE_DEBIT_PREVENTED`).
7. **Le formateur est hors du fil** : notifié à l'ouverture et à la résolution,
   il ne participe pas à la conversation apprenant/support. Il voit le **motif
   (enum)** et le titre de la ressource, **jamais** le détail libre saisi par
   l'apprenant. Il peut **contester la décision**, ce qui crée un ticket support
   rattaché au litige (arbitrages 16, 19).
8. **Fallback manuel explicite** : un remboursement que l'API du fournisseur ne
   peut pas exécuter devient une **tâche Finances** (`ManualRefundTask`),
   auditée, avec idempotence par litige. Jamais de nouvelle tentative
   silencieuse.
9. **Expiration automatique** : un litige sans réponse bascule en
   `RESOLVED_AUTO` par tâche planifiée horaire.

### F9 — Abonnement formateur, stockage, fin de vie

**Règles opposables** (arbitrages 49-70, A1-A19)

1. **Deux cadences**, droits identiques. Le changement de cadence est enregistré
   immédiatement mais **ne prend effet qu'au renouvellement** ; la période en
   cours n'est ni écourtée, ni recalculée.
2. **Le tarif est administré, pas déployé** : le Super-admin fixe la grille,
   bascule gratuit ⇄ payant, accorde des réductions. **Finances accorde des
   réductions, et rien d'autre.** Un tarif est **daté** : poser un nouveau tarif
   **borne le précédent**, il ne le réécrit jamais.
3. **La bascule prend effet au renouvellement de chacun**, pas à une date
   commune.
4. **Trois canaux de réduction** — campagne globale, remise nominative motivée,
   code promo — qui **ne s'additionnent jamais** : **la plus favorable
   l'emporte**.
5. Un **registre des remises** distinct du journal d'audit, ouvert à Finances,
   liste chaque remise, son auteur et son motif.
6. **Renouvellement automatique : opt-in**, prélevé sur le **solde retirable** du
   formateur, rejoué chaque nuit en cas d'échec.
7. **Impayé** : `ACTIVE → PAST_DUE → SUSPENDED` après **14 jours de grâce**.
   Écriture bloquée et **ressources retirées du catalogue** — plus aucune vente
   nouvelle. **Les acheteurs gardent leur accès.** Le règlement **republie
   automatiquement**.
8. **La dette survit à la résiliation** et se prélève sur le solde.
9. **Résiliation libre, à effet fin de période**, mais **conditionnelle** : une
   communauté active se ferme d'abord, les lives programmés après le terme sont
   annulés, les ventes en cours sont soldées.
10. **Contenu sous obligation** : ce que le formateur doit encore à un acheteur
    ou à un membre **sort du quota** de stockage et ne peut pas être supprimé.
    Une suppression demandée retire le fichier mais **conserve la fiche**.
11. **Espace dormant fermé après 24 mois**, après relance.
12. **Un remboursement ne rend l'espace qu'à la prochaine échéance.**

### F10 — Signalements, modération, sanctions

1. **Cinq surfaces signalables** : une ressource, un compte, une communauté, un
   message de messagerie, un message de litige.
2. Quand la Modération **retient** un signalement, la seule sanction disponible
   sur l'objet est le **retrait de la ressource du catalogue**.
3. **Deux niveaux de sanction de compte** (arbitrage 67) :
   - `RESTRICTED` — posé par la **Modération** : lecture seule. La personne se
     connecte encore et garde ce qu'elle a acheté, mais ne peut plus publier,
     acheter ni écrire.
   - `BANNED` — réservé au **Super-admin** : la connexion est coupée.

### F11 — Administration

Vingt-quatre écrans, tous accessibles depuis une navigation **filtrée par
sous-rôle** : validation des formateurs · litiges · remboursements manuels ·
moyens de paiement et escalades · retraits · portefeuilles · transactions ·
abonnements · remises · tarification · taux de change · signalements ·
utilisateurs · administrateurs · analytique · intégrations · paramètres ·
journal d'audit.

**Règles opposables**

1. Les écrans « Transactions » et « Utilisateurs » sont en **consultation
   seule**.
2. Le **journal d'audit** est réservé au Super-admin, filtrable par domaine et
   par objet : cliquer un identifiant remonte tout ce qui a touché le même
   objet. Aucune action de modification.
3. Un écart de solde constaté est **journalisé et alerté**, jamais réparé
   silencieusement. La correction passe par un **endpoint Super-admin dédié**
   qui écrit une ligne `WalletReconciliation`.
4. Toute transition d'état sensible écrit dans l'audit **à l'intérieur de la
   transaction métier**. Pas de journalisation « au mieux ».

### F12 — Notifications et préavis

1. **Deux canaux, et deux seulement** : e-mail (Resend) et notification in-app.
   Aucun SMS.
2. **Politique de préavis unique** (arbitrage 103) : tout ce qui **se termine**
   prévient à **J-7 puis J-1** — fin d'adhésion offerte, fin d'adhésion,
   échéance d'abonnement. Le préavis **J-30** est réservé au cas où
   l'avertissement appelle un **geste coûteux** : la purge d'un replay.
3. Un changement de tarif est annoncé **60 jours** avant.
4. Un changement de moyen de versement alerte **l'ancienne adresse e-mail**,
   avec un lien de signalement.
5. **Cinq événements courants partent aussi par e-mail**, en plus de la
   notification in-app qui reste la trace consultable dans le compte :

   | Événement | Destinataires | Catégorie |
   |---|---|---|
   | Nouveau message | Le destinataire du message | Relationnel |
   | Achat abouti | L'acheteur (reçu) **et** le formateur (vente réalisée) | Transactionnel |
   | Invitation émise | L'invité | Hors préférence |
   | Invitation acceptée | L'émetteur de l'invitation | Relationnel |
   | Adhésion à une communauté | Le nouveau membre **et** le formateur | Transactionnel |

   L'annonce de vente au formateur n'est pas un agrément : c'est la seule façon
   d'apprendre qu'on a vendu sans surveiller un écran.

6. **Deux catégories, un seul interrupteur nouveau.**
   - Le **transactionnel** ne se coupe pas : un reçu, une facture, un accès qui
     s'ouvre sont des preuves, pas des annonces. Aucune préférence ne s'y
     applique.
   - Le **relationnel** se coupe d'un seul geste, par une préférence unique.
   - Une **invitation** part vers une adresse qui n'a peut-être aucun compte :
     aucune préférence n'existe pour la porter, l'envoi est donc systématique.

   Le profil compte ainsi **deux interrupteurs** au total : le relationnel, et
   celui des préavis d'abonnement qui existait déjà. Pas cinq. Une page de
   réglages avec un interrupteur par événement serait pire que le problème.

7. **Une action ne produit jamais deux notifications.** Les effets de bord d'un
   événement sont émis une fois, à l'endroit qui commet la transaction — ni au
   webhook **et** au retour navigateur, ni à deux appelants d'une même règle.

8. Le **rappel avant une séance en direct reste ajourné** — voir §14. Son
   absence de cette liste est une décision, pas un oubli.
9. **L'annonce d'un formateur est un message de son groupe, marqué comme tel**
   (arbitrage 128). Le marquage fait deux choses : il **épingle** le message en
   tête du groupe, et il **notifie tous les membres**, in-app et par e-mail selon
   leur préférence relationnelle.

   Les deux moitiés sont nécessaires. Une notification seule perdrait la
   relecture — la liste est plafonnée à cinquante lignes, et une annonce
   importante en sortirait au bout de cinquante événements. Un message seul ne
   préviendrait personne. `Community.broadcastEnabled` disparaît : il ne reste
   que quatre interrupteurs de communauté.

---

## 6. Règles métier transverses et invariants

### 6.1 Invariants financiers

```
Wallet.reservedBalance      = SUM(FundReservation.reservedAmountFcfa WHERE status = ACTIVE)
Wallet.pendingPayoutBalance = SUM(Payout.amountFcfa WHERE status IN
                                  (PENDING, AUTO_APPROVED, IN_REVIEW, APPROVED))

solde retirable = balance - reservedBalance - pendingPayoutBalance

negativeSince non null  <=>  solde retirable < 0
```

- `reservedBalance` est **réservé aux litiges** ; les retraits n'y écrivent
  jamais. `pendingPayoutBalance` est **réservé aux retraits en vol** ; les
  litiges n'y écrivent jamais.
- Un **solde négatif est autorisé** (pas de contrainte `CHECK`), tout nouveau
  retrait est alors bloqué, et le négatif est apuré par les ventes suivantes.
  Alerte Finances si un portefeuille reste négatif **plus de 60 jours**.
- **Aucun état terminal d'un litige** ne doit laisser une `FundReservation` en
  `ACTIVE`.
- Le crédit du portefeuille est **idempotent** et **déclenché uniquement par un
  webhook réel**.
- En cas d'écart : journaliser et alerter, **jamais** d'auto-réparation.

### 6.2 Rétentions

| Donnée | Durée | Départ |
|---|---|---|
| Documents d'identité et d'immatriculation | 90 jours | Décision sur le dossier |
| Adresse e-mail invitée | 90 jours | État terminal de l'invitation |
| Replay | 24 mois | **Date du live** |
| Journal d'audit | Purge hebdomadaire selon politique de rétention | Écriture |
| Compte supprimé | Purge différée après rappel | Demande |

### 6.3 Conséquences structurelles à garder en tête

- **Plafond KYC à 70 sans moyen de versement vérifié** — aucun premier retrait
  n'est donc auto-approuvable, ce qui est cohérent avec la règle du premier
  retrait en revue manuelle.
- Le critère « aucun litige ouvert » **vaut 0** si le formateur n'a aucune vente
  réglée : il récompense l'absence de litige sur une activité réelle, pas
  l'inactivité.
- Une communauté ouverte **rend son animateur visible** : un formateur entre
  dans l'annuaire s'il est approuvé, non suspendu, et qu'il a **une ressource
  publiée _ou_ une communauté active et publique**. La règle de visibilité et
  l'encart qui l'explique au formateur ne doivent jamais diverger.

---

## 7. Modèle de données

PostgreSQL, Prisma, identifiants `uuid`. **1 866 lignes de schéma**, une
soixantaine de modèles. Vue d'ensemble par agrégat :

| Agrégat | Modèles principaux |
|---|---|
| Comptes | `User`, `RecoveryCode`, `EmailOtp`, `Notification`, `AuditLog` |
| Formateur | `TrainerProfile`, `TrainerApplication`, `TrainerDocument`, `TrainerActivationPayment`, `*ReviewEvent` |
| Contenu | `Course`, `CommunityCourse`, `Favorite`, `CourseView`, `PendingAttachment` |
| Communauté | `Community`, `CommunitySubscription`, `CommunityInvitation`. `CommunityPost` et `CommunityPostReply` sont **vidées** depuis la bascule (arbitrage 126) : conservées pour l'historique des signalements, plus rien n'y écrit |
| Échanges | `Conversation` (directe ou de groupe), `Message`, `ConversationRead` |
| Direct | `LiveSession`, `LiveParticipant`, `LiveMessage`, `Replay` |
| Argent | `Purchase`, `Invoice`, `InvoiceCounter`, `Wallet`, `WalletDebit`, `WalletReconciliation`, `FxRate` |
| Versements | `PayoutMethod`, `Payout`, `*ReviewEvent` |
| Litiges | `Dispute`, `DisputeMessage`, `FundReservation`, `ConsumptionSnapshot`, `ManualRefundTask`, `SupportTicket` |
| Abonnement | `SubscriptionPayment`, `SubscriptionCharge`, `PlatformTariff`, `PlatformDiscount` |
| Modération | `Report`, sanctions portées par `User` |
| Configuration | `Setting` |

**Conventions de modélisation**

1. Montants : **FCFA en `Int`**, EUR en `Decimal(10,2)`. **Jamais de `Float` sur
   de la monnaie.**
2. `onDelete: Restrict` sur **toutes** les clés étrangères financières ; **soft
   delete** explicite pour les comptes.
3. **Snapshots** systématiques sur les objets financiers : taux de commission,
   parts, nom et coordonnées au moment du fait. Une décision passée doit rester
   lisible après évolution du présent.
4. `Community.trainerId` est modélisé **1-to-many** avec contrainte
   applicative « une communauté par formateur » — pas de contrainte d'unicité en
   base, pour ne pas fermer l'avenir.
5. Index unique partiel sur `CommunitySubscription` incluant `BANNED` : on ne
   peut pas ré-adhérer pour effacer un bannissement.
6. **Point d'attention connu** : `Setting.updatedById` / `createdById` sont du
   texte nu, sans clé étrangère. Une purge de comptes les laisse orphelins.

---

## 8. Architecture et conventions techniques

### 8.1 Pile

| Couche | Choix |
|---|---|
| Framework | **Next.js 16** (App Router, React 19, Turbopack), sortie **standalone** |
| Langage | TypeScript strict |
| Base | **PostgreSQL** via Prisma 6 — migrations versionnées, **jamais `db push`** |
| Authentification | NextAuth v4, argon2id, OTP e-mail, TOTP |
| UI | Tailwind CSS 4, Radix UI / shadcn, `lucide-react` |
| État serveur | TanStack Query · État client : Zustand |
| Validation | Zod (schémas partagés dans `src/lib/validation.ts`) |
| Stockage objet | Cloudflare R2 (API compatible S3), URLs pré-signées |
| Tâches planifiées | `node-cron` en processus, démarrées par `src/instrumentation.ts` |
| Tests | Vitest sur une base PostgreSQL réelle |

### 8.2 Conventions d'API — opposables

| Sujet | Règle |
|---|---|
| Préfixe | `/api`, sans versionnage |
| Réponse | `{ data, meta? }` en 2xx |
| Erreur | `{ error: { code, message, details? } }`, code en `SCREAMING_SNAKE_CASE` |
| Codes HTTP | 400 validation · 401 non authentifié · 403 permission · 404 · 409 conflit ou concurrence · 410 purgé · **422 règle métier** · 429 limitation |
| Pagination | `page` + `pageSize`, **maximum 50** |
| Concurrence | Contrôle **optimiste** par `expectedUpdatedAt` sur toute transition d'état sensible, `updateMany` gardé, 409 `STALE_*` sinon |
| Audit | Écriture **dans la transaction** métier. Pas de journalisation opportuniste |
| Limitation de débit | En mémoire, avec purge périodique |

**Règle d'erreur métier** : aucune erreur de domaine ne doit retomber dans le
message générique. Le mapping par domaine est mutualisé (`errorFromException`)
et **testé** — un ajout de route qui l'oublie casse la suite.

### 8.3 Règles d'environnement — opposables

1. **Ne jamais se dégrader silencieusement en l'absence de clé.** Le motif
   « sans clé, on ne casse pas » a déjà contaminé des gardes de paiement et de
   session : une configuration absente doit **fermer** la porte, pas l'ouvrir.
2. Les redirections sont **relatives** : en sortie standalone, `request.url`
   porte l'adresse d'écoute du conteneur, pas celle du visiteur.
3. Le cookie de session est posé et effacé avec `Secure` sous HTTPS.
4. **Aucune page authentifiée n'est mise en cache** — le téléphone est partagé.

---

## 9. Intégrations externes

| Service | Rôle | Contraintes |
|---|---|---|
| **Stripe** | Paiement carte, chargebacks, remboursements | Checkout **hébergé** — aucune donnée de carte chez NkamVa. Webhooks signés `charge.dispute.created` / `closed` |
| **PawaPay** | Mobile money : encaissement, reversement, remboursement | **`/v2/active-conf` fait foi** pour les pays, opérateurs et devises — jamais de liste écrite à la main. Attention aux décimales au remboursement. Libellé de relevé borné à 22 caractères |
| **LiveKit** | Visioconférence et egress d'enregistrement | 9 publieurs vidéo simultanés ; egress direct vers le stockage objet |
| **Mux** | Adaptateur vidéo **conservé comme option**, pas comme chemin par défaut | Ne pas en faire une dépendance du parcours |
| **Cloudflare R2** | Stockage objet (contenus, documents, replays, couvertures) | Pas de journaux d'accès serveur : la journalisation est **applicative** |
| **Resend** | E-mail transactionnel | `react-email` **non installé** — gabarits HTML minimaux |
| **PostgreSQL infogéré** | Base | L'application lit par le *pooler* ; les migrations exigent une **connexion directe** (`DIRECT_URL`) |
| **MTN MoMo** | Vérification du nom du titulaire (`basicuserinfo`) | Prévu, **non intégré**. Ailleurs, revue manuelle Finances |

**Règle de couplage** : `fetchOperatorAccountName()` est le **seul** point par
lequel une information d'identité externe entre dans le système. La comparaison
de noms (`lib/name-match.ts`) ne compare que ce qu'elle en reçoit.

---

## 10. Exigences non fonctionnelles

### 10.1 Mobile first — budgets chiffrés (arbitrages 108-117)

| Sujet | Budget |
|---|---|
| Appareil de référence | Android d'entrée de gamme, **360-375 px** de large |
| Réseau de référence | 3G rapide — 1,6 Mb/s descendant, **300 ms** de latence |
| Transfert au premier rendu | **≤ 300 Ko** hors polices, **par route** |
| Images par écran de liste | ≤ 120 Ko cumulés |
| Une couverture servie sur mobile | ≤ 60 Ko |
| LCP | **≤ 3 s** sur ce profil |
| Chrome vertical | ≤ 22 % de la hauteur visible |
| Points de rupture | Ceux de Tailwind : `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280. **Aucun seuil arbitraire** |
| Plancher typographique | Aucun texte sous **13 px** ; **14 px** pour tout texte nécessaire à l'action |

**Point de départ mesuré** (build de production du 14 août 2026) : 1 080 Ko de
JavaScript client gzippé sur 93 fragments, dont un socle commun de 157 Ko chargé
sur chaque page. Le budget de 300 Ko est donc **à moitié consommé avant tout
affichage** — il ne laisse aucune marge pour une dépendance lourde
supplémentaire.

**Le budget se lit par route, pas globalement.** Une dépendance lourde reste
interdite **dans le socle commun** et dans toute route de parcours — accueil,
catalogue, fiche, tunnel d'achat. Elle est admise sur une route terminale qui
en a besoin pour rendre son objet, à trois conditions cumulatives :

1. elle est chargée en **import dynamique**, jamais dans le socle ;
2. la route qui la porte est **hors parcours d'acquisition** — on y arrive
   après avoir payé, pas avant de décider ;
3. son poids réel est **mesuré et consigné ici** au moment de la livraison.

Le seul cas ouvert à ce jour est le **visualiseur de document** de la route de
lecture d'une ressource achetée (voir F3, « Consultation d'une ressource
achetée »). Le budget de 300 Ko continue de valoir, inchangé, sur toutes les
autres routes.

### 10.2 Les onze règles d'expérience — critères opposables

Toute livraison se juge sur cette liste, vérifiée par `scripts/smoke-mobile.ts`.

1. Toute couche superposée est une **entrée d'historique** — le retour la ferme,
   il ne quitte jamais l'écran.
2. Toute action donne un retour en **moins de 100 ms**, et **jamais** un retour
   contradictoire (succès annoncé pendant que la liste montre l'ancien état).
3. Toute destination principale est atteignable **en un appui**, dans le tiers
   bas de l'écran.
4. Toute cible tactile fait au moins **44 × 44 px** de zone utile.
5. Tout champ déclare son clavier : `type`, `inputMode`, `autoComplete`,
   `enterKeyHint`.
6. À la soumission, le focus va au **premier champ en défaut**.
7. Aucun texte porteur de sens sous **13 px**.
8. Le chrome reste sous son plafond.
9. Le contenu est **lisible avant que le JavaScript ait fini** — aucune
   animation d'apparition ne retient du contenu.
10. **Aucune page authentifiée n'est mise en cache.**
11. **Rien ne consomme de données sans demande**, sauf le tunnel de paiement.

**Navigation** — barre d'onglets basse, cinq emplacements maximum, le cinquième
ouvrant une feuille glissante :

| Espace | Entrées |
|---|---|
| Visiteur | Accueil · Catalogue · Communautés · Se connecter |
| Apprenant | Accueil · Mes ressources · Catalogue · Mes communautés · Plus |
| Formateur | Accueil · Espace formateur · Mes ressources · Catalogue · Plus |

Un formateur **reste** un apprenant : sa barre ajoute, elle ne remplace pas.
Une **source de navigation unique**, deux rendus (barre haute bureau, barre
basse mobile) : on mutualise la source, pas les rendus.

### 10.3 Sécurité

1. Mots de passe en argon2id ; sessions invalidables par utilisateur.
2. Aucune donnée de carte ne transite par la plateforme.
3. Webhooks **signés et vérifiés** ; traitement idempotent.
4. URLs pré-signées à durée courte ; les couvertures suivent **deux chemins
   assumés** — route de redirection pour une ressource, URL signée pour une
   communauté — qu'il ne faut pas unifier.
5. Cloisonnement admin vérifié **dans les deux sens** par des tests dédiés.
6. Aucun message d'erreur ne révèle l'existence d'un objet qu'on n'a pas le
   droit de voir (communauté privée → 404 ; jeton invalide → message générique).
7. Limitation de débit sur les points sensibles : ouverture de litige, création
   de moyen de paiement, demande de retrait, pré-signature d'upload.

### 10.4 Exploitation

- Tâches planifiées **idempotentes**, exécutées en UTC, sans chevauchement,
  journalisant `SCHEDULED_JOB_COMPLETED` / `FAILED`.
- Une route `/api/health`.
- Déploiement en sortie **standalone**, staging et production côte à côte sur le
  même serveur.
- **Attention connue** : la base de développement est distante (~223 ms
  d'aller-retour). Un chronomètre local mesure le trajet, pas la performance ; ce
  qui transpose, c'est la **profondeur de cascade** des requêtes, pas leur durée.

---

## 11. Conformité, juridique et fiscal

Le détail vit dans `docs/registre-des-traitements.md` et
`docs/a-valider-par-un-conseil.md`. Ce qui suit est ce que le cahier des charges
retient comme **exigence**.

### 11.1 Données personnelles

La loi camerounaise **n° 2024/017 du 23 décembre 2024** impose un **registre des
traitements**, la **notification des violations** à l'autorité et aux personnes
concernées, et une **autorisation préalable de l'APDP pour tout transfert hors
du Cameroun**. Sa période de mise en conformité s'est achevée le 23 juin 2026.

**Or la totalité des traitements passe par des sous-traitants hors du
Cameroun** : base, stockage objet, e-mail, et les deux fournisseurs de paiement.
L'un d'eux porte des **pièces d'identité** et des **coordonnées bancaires**.
La conformité est donc un **lot de travail**, pas une page de confidentialité.

### 11.2 Réglementation financière

En zone CEMAC, fournir des services de paiement suppose un agrément. La réforme
en cours crée au **1er janvier 2027** une catégorie visant explicitement
l'**acquisition et l'agrégation de paiement**, avec agrément COBAC et
**cantonnement des fonds de clients**. Le portefeuille NkamVa — qui encaisse,
retient, débite et reverse — ressemble davantage à un compte de paiement qu'à un
compte fournisseur. **Il faut que la qualification retenue soit vraie en droit,
pas seulement dans notre tête** (arbitrage 92).

### 11.3 Trois points bloquants avant toute mise en ligne publique

1. **L'identité de l'éditeur** — quatorze emplacements des trois pages légales
   affichent un marqueur à la place d'une mention obligatoire.
2. **Deux jeux de conditions générales coexistent et se contredisent** — les
   documents Markdown de `src/content/legal/` ne sont importés par aucun
   fichier, tandis que les pages servies divergent d'eux sur le seuil de
   consommation, l'assiette de la commission, le préavis tarifaire et la voie de
   remboursement. Il faut savoir lequel engage.
3. **L'autorisation de transfert auprès de l'APDP.**

### 11.4 Autres écarts à instruire

- **TVA** : affirmée dans le contrat, absente du code — et l'assiette de la
  commission diffère entre les deux textes légaux.
- **Aucune trace d'acceptation des conditions** n'est conservée.
- **L'âge de 16 ans est purement déclaratif.**
- **Aucune licence n'est accordée à NkamVa** dans les conditions servies, alors
  que la plateforme héberge et diffuse les contenus des formateurs.
- **« Accès sans limite de durée »** annoncé, contre des purges programmées.
- **Retenue à la source** sur les versements aux formateurs, conformité de la
  facture, durées légales de conservation comptable, produit du change.

---

## 12. Qualité et recette

### 12.1 Ce qui est vérifié automatiquement

- **57 fichiers de test** Vitest, exécutés contre une **base PostgreSQL réelle**
  (pas de double en mémoire), en exécution non parallèle entre fichiers.
- Familles de tests : invariants par lot, cloisonnement admin, atteignabilité
  des routes, erreurs traduites, abonnement et prélèvements, litiges, KYC,
  communautés et adhésions, lives, replays et purges, suppression de compte,
  visibilité formateur, recherche, taux de change.
- **Garde-fou mobile** (`scripts/smoke-mobile.ts`) : les onze règles
  d'expérience ; une régression de *règle* échoue avant d'être livrée. Une
  régression de *géométrie* demande encore une vérification humaine.
- `scripts/orphans.ts` : détection de code mort.

### 12.2 Définition de « fini »

Une livraison n'est **pas** finie tant que :

1. `tsc` passe **et** la suite de tests passe ;
2. le parcours concerné a été **réellement exécuté** contre les services de
   développement — pas seulement compilé ;
3. le **rendu a été vérifié dans le DOM**, pas seulement le code HTTP : une page
   qui plante au rendu peut répondre 200 si une frontière d'erreur l'absorbe ;
4. aucune règle d'expérience mobile n'a régressé ;
5. les montants affichés viennent de leur source unique.

### 12.3 Pièges connus, à ne pas rejouer

- Un **build vert ne prouve rien** : des processus résiduels produisent des 500
  trompeurs.
- Les **captures d'écran ne suffisent pas** sur les écrans authentifiés : la
  vérification passe par le DOM.
- Une divergence d'`useId` en mode développement est un **artefact des outils de
  développement** — rejouer en build de production avant d'enquêter.
- Le **panneau navigateur intégré ne rend pas les images animées** : transitions
  et défilement doux y semblent figés, ce qui simule de faux défauts.
- **Ne jamais utiliser `git stash`** dans ce dépôt : la pile est commune au
  dépôt et à ses arbres de travail, et deux sessions concurrentes ont déjà
  échangé leurs modifications.
- Un **arbre de travail neuf n'a pas de `node_modules`** : une jonction suffit à
  `tsc` et aux tests, mais pas au serveur de développement.
- Le **seed de démonstration purge la base** et pilote les vrais services : il
  n'est pas idempotent, par choix.

---

## 13. État d'avancement et reste à faire

*Photographie au 19 août 2026, branche `develop`. Les fonctionnalités décrites
au §5 sont implémentées sauf mention contraire ci-dessous.*

### 13.1 Livré

| Domaine | État |
|---|---|
| Socle (API, audit, auth, e-mail, notifications, stockage, limitation de débit) | Livré |
| Candidature formateur et vérification documentaire | Livré, écrans compris |
| Litiges, réservations de fonds, remboursements, chargebacks | Livré |
| KYC, moyens de versement, retraits, réconciliation | Livré, écrans compris |
| Parcours d'achat (Stripe Checkout + PawaPay), factures | Livré |
| Communautés, adhésions, invitations, fil | Livré |
| Messagerie | Livré — fils, groupes, droits d'écriture, accusés de lecture, clé d'idempotence à l'envoi et sondage du §4.2 |
| Lives, replays, purges et préavis | Livré |
| Abonnement formateur, tarification, remises, stockage, fin de vie | Livré |
| Signalements, sanctions, administration à trois sous-rôles, journal d'audit | Livré |
| **24 tâches planifiées** | Câblées |
| Mobile first — lots 0, 1, 2 et 4 | Livrés (branche `feat/mobile-first`) |

### 13.2 Reste à faire — par ordre de blocage

1. **Les trois points bloquants du §11.3** — identité de l'éditeur, conditions
   générales contradictoires, autorisation de transfert. Rien ne se met en ligne
   publiquement avant.
2. **La messagerie unifiée** — **livrée**. Les deux temps sont faits : la
   messagerie accueille les groupes, et l'historique a basculé (arbitrages
   126-130). La cadence d'un groupe a été tranchée au lot 4 : ce n'est pas la
   fréquence qui devait changer, c'est la charge — le sondage d'un fil est
   devenu incrémental.
3. **Les dix lots issus de l'audit fonctionnel du 1er septembre 2026** — audit
   mené sur `develop`, tel que servi par staging. Neuf constats sont confirmés
   par le code, un attend une reproduction. **Lots 0 à 5 livrés** : reprise de
   l'action après authentification (F1.6) · notifications et e-mails (F12.5
   à F12.7) · historique des ventes (F7.11) · idempotence et sondage de la
   messagerie (§4.2) · compteur d'usages des invitations (F5). **Restent** :
   durée mesurée et retrait du nombre de sessions (F3.8) · position de lecture
   (F3, « Consultation ») · ressource et communauté associées (F3.10, F3.11) ·
   lives · recette finale.

   Deux de ces lots sont **bloqués par un arbitrage** listé au §14 : le sort
   d'une ressource incluse quand sa communauté ferme, et la portée de
   `resourcesEnabled`.
4. **Mobile first, lot 3** — les écrans, partiellement livré : 62 pages,
   administration retirée du périmètre. C'est le gros du chantier restant.
5. **Montant de l'abonnement payant** — jamais arbitré. Sans successeur, borner
   la gratuité au 31 décembre 2026 ne change rien. Deux montants à dire.
   **Conséquence désormais visible en vitrine** : `/tarifs` annonce « 9 000
   FCFA/mois » et « 0 FCFA/an » — la paire est incohérente pour qui la lit.
6. **Réponse de PawaPay** sur le règlement en devise locale par marché et sur la
   présence éventuelle d'un nom de payeur dans les rappels — la seconde réponse,
   si elle est positive, rend l'intégration MTN inutile.
7. **Écarts résiduels connus** : notification de résolution de litige au
   formateur ; distinction `INDIVIDUAL` / `BUSINESS` dans la vérification ;
   limitations de débit définies mais non branchées sur toutes les routes ;
   `negativeSince` non recalculé lors d'un débit de remboursement ;
   `react-email` non installé ; couche « name lookup » opérateur inactive.
8. **Redirection de l'espace visiteur** — un utilisateur connecté navigue
   librement dans l'espace public. **Ajourné volontairement** : deux arbitrages
   doivent précéder toute ligne de code (le périmètre, puisque `/recherche` n'a
   pas de jumeau connecté et deviendrait inaccessible ; et l'échappatoire « voir
   la fiche publique » pour le formateur qui inspecte sa vitrine).

---

## 14. Risques et points non arbitrés

| Risque | Nature | Ce qu'il faut décider ou faire |
|---|---|---|
| **Qualification du portefeuille** | Réglementaire, structurant | Faire qualifier avant le 1er janvier 2027 (§11.2) |
| **Transferts hors Cameroun sans autorisation** | Réglementaire, bloquant | Dossier APDP |
| **Conséquence fiscale de la vente en nom propre** | Fiscal | Si NkamVa vend en son nom, la TVA porte-t-elle sur le prix entier plutôt que sur la commission, et à quel taux ? Seule inconnue pouvant rendre l'arbitrage 92 plus cher que le problème qu'il résout |
| **Le change** | Financier | Le même taux encaisse et reverse. **Majorer le taux ne couvre pas le *spread*** : 1 % de *spread* coûte 12 % de la commission. À traiter comme une ligne de coût, pas comme un réglage de taux |
| **Secrets réels présents dans l'historique du dépôt** | Sécurité | Rotation des clés concernées ; ne jamais laisser un fichier d'environnement entrer dans une fusion |
| **L'environnement de développement écrit dans le stockage de production** | Sécurité / exploitation | Séparer les seaux avant tout élargissement de l'équipe |
| **Budget mobile déjà à moitié consommé** | Performance | Aucune dépendance lourde dans le socle ni sur une route de parcours. Sur une route terminale, elle est admise aux trois conditions du §10.1 — import dynamique, hors parcours d'acquisition, poids mesuré et consigné |
| **Rappel avant une séance** | Produit | **Ajournement confirmé le 4 septembre 2026.** L'audit du 1er septembre l'énumère parmi les notifications attendues, mais personne n'a constaté son absence comme un défaut : il reste une hypothèse tant que le premier live réel n'a pas eu lieu. Son absence de F12.5 est donc une décision, pas un oubli — et l'outillage existe déjà (préavis J-7/J-1, tâches planifiées) le jour où elle sera prise |
| **Ressource incluse dans une communauté qui ferme** | Produit, bloquant pour F3.10 | La bascule vendue → incluse est à sens unique : la ressource ne peut pas retourner au catalogue. Reste-t-elle servie aux membres entrés, disparaît-elle, ou le formateur récupère-t-il un droit de republication ? |
| **Les ressources incluses éteintes valent-elles « fermé » ?** | Produit, bloquant pour F3.10 | `resourcesEnabled` à faux sur une communauté par ailleurs active : peut-on encore y associer une ressource ? Le contrôle porte aujourd'hui sur `status` seul |
| **Le formateur dans les groupes qu'il a rejoints** | Produit | Rien ne lui interdit d'y écrire comme apprenant, mais son nom y apparaît sans distinction de rôle |
| **`Community.messagesPerDay`** | Produit | La colonne existe et n'est lue par personne. Un groupe actif est le premier endroit où un plafond servirait |
| **Inscription à une séance, distincte de la présence** | Produit | Ajourné — l'absence de jauge a retiré ce qui la rendait nécessaire |
| **Contrepartie du parrain** | Produit | Ajournée ; financée sur la commission NkamVa si elle arrive |

---

## 15. Annexes

### A. Énumérations principales

- `Role` : `LEARNER`, `PENDING_TRAINER`, `TRAINER`, `ADMIN`
- `AdminRole` : `SUPER_ADMIN`, `FINANCES`, `MODERATION`
- `SanctionLevel` : `NONE`, `RESTRICTED`, `BANNED`
- `CourseCircuit` : `MARKETPLACE`, `COMMUNITY`
- `PlanCadence` : `MONTHLY`, `YEARLY`
- `TrainerSubscriptionStatus` : `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELED`
- `PaymentProvider` : `STRIPE`, `PAWAPAY`
- `PaymentStatus` : `PENDING`, `SUCCEEDED`, `FAILED`, `REFUNDED`, `DISPUTED`, `CANCELED`
- `CommunityVisibility` : `PUBLIC`, `PRIVATE`
- `CommunitySubscriptionStatus` : `ACTIVE`, `PAST_DUE`, `BANNED`, `CANCELED`, `EXPIRED`
- `InvitationKind` : `NOMINATIVE`, `SHARE_LINK` · `InvitationGrant` : `GIFT`, `PAID`
- `PayoutMethodType` : `BANK_IBAN`, `MOBILE_MONEY` · `AccountNature` : `INDIVIDUAL`, `BUSINESS`
- `MobileMoneyOperator` : `ORANGE_MONEY`, `MTN_MOMO`, `AIRTEL_MONEY`, `M_PESA`
- `PayoutMethodVerificationStatus` : `PENDING_REVIEW`, `AUTO_VERIFIED`, `MANUAL_VERIFIED`, `VERIFIED`, `REJECTED`, `BLOCKED`, `ARCHIVED`
- `PayoutStatus` : `PENDING`, `AUTO_APPROVED`, `IN_REVIEW`, `APPROVED`, `REJECTED`, `PAID`, `FAILED`
- `DisputeStatus` : `OPEN`, `IN_REVIEW`, `WAITING_LEARNER`, `RESOLVED_REFUNDED`, `RESOLVED_REJECTED`, `RESOLVED_AUTO`
- `DisputeResolution` : `FULL_REFUND`, `PARTIAL_REFUND`, `REJECT`, `AUTO_TIMEOUT`
- `FundReservationStatus` : `ACTIVE`, `RELEASED`, `DEBITED`, `PARTIALLY_DEBITED`

### B. Tâches planifiées (24, en UTC)

| Famille | Tâches |
|---|---|
| Litiges | `DISPUTE_AUTO_TIMEOUT` (horaire) |
| Portefeuille | `WALLET_RECONCILIATION`, `WALLET_NEGATIVE_ALERT` (quotidien 03:30) |
| Versements | `PAYOUT_METHOD_CARENCE_EXPIRY` (horaire), `PAYOUT_SLA_ALERT` (horaire) |
| Documents et pièces jointes | `TRAINER_DOCUMENT_PURGE`, `PENDING_ATTACHMENT_CLEANUP` |
| Comptes | `DELETED_ACCOUNT_PURGE`, `PENDING_DELETION_REMINDER` |
| Abonnement | `SUBSCRIPTION_RENEWAL`, `SUBSCRIPTION_AUTO_DEBIT_RETRY`, `SUBSCRIPTION_SUSPENSION`, `SUBSCRIPTION_SUSPENSION_ALERT`, `SUBSCRIPTION_END_CANCELED`, `TRAINER_SPACE_DORMANT_CLOSE` |
| Adhésions | `MEMBERSHIP_RENEWAL`, `MEMBERSHIP_EXPIRY`, `GIFT_MEMBERSHIP_ENDING_NOTICE`, `COMMUNITY_ACTIVITY_REFRESH` |
| Replays | `REPLAY_PURGE`, `REPLAY_PURGE_ALERT`, `REPLAY_RECONCILE` (toutes les 10 min) |
| Tarification | `TARIFF_SWITCH_NOTICE` |
| Audit | `AUDIT_LOG_PURGE` (hebdomadaire) |

### C. Chiffres de référence

| Sujet | Valeur |
|---|---|
| Commission plateforme | 15 % · part formateur 85 % |
| Stockage inclus | 40 Go · tranche 50 Go à 3 000 FCFA/mois ou 30 000 FCFA/an |
| Délai d'ouverture d'un litige | 14 jours · seuil de consommation 30 % (formats streamés) |
| Carence moyen de versement | 72 h · SLA de revue 48 h calendaires · 3 rejets maximum |
| Seuils KYC | ≥ 80 vérifié · 50-79 à vérifier · < 50 non vérifié |
| Grâce impayé abonnement | 14 jours |
| Rétention replay | 24 mois · préavis 30 jours |
| Espace dormant | Fermé après 24 mois |
| Préavis de changement tarifaire | 60 jours |
| Publieurs vidéo simultanés | 9 |
| Quotas d'invitation | 20 offertes / 30 jours · lien 25 acceptations / 90 jours |
| Fin de la gratuité de lancement | 31 décembre 2026 |

### D. Glossaire

| Terme | Sens |
|---|---|
| **Ressource** | Un contenu pédagogique vendu à l'unité ou inclus dans une communauté |
| **Circuit** | Le mode de distribution d'une ressource : marketplace ou communauté |
| **Communauté** | L'espace payant par abonnement d'un formateur |
| **Groupe** | Le fil collectif d'une communauté, dans la messagerie. Remplace « salon » (arbitrage 127) |
| **Replay** | L'enregistrement automatique d'une session en direct |
| **Portefeuille** | Le solde du formateur chez NkamVa : crédité, réservé, immobilisé, retirable |
| **Solde réservé** | La part immobilisée par un litige en cours |
| **Solde immobilisé** | La part immobilisée par un retrait en vol |
| **Carence** | Le délai incompressible après ajout ou modification d'un moyen de versement |
| **Escalade** | Le passage d'un dossier bloqué de Finances au Super-admin |
| **Obligation** | Ce qu'un formateur doit encore à un acheteur ou à un membre, et qui sort du quota |
