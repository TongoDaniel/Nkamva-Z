# Ce qui doit être validé par un professionnel

> **Établi le 18 août 2026, dérivé du code.** Chaque point ci-dessous renvoie au
> fichier qui le pose. Ce document ne tranche rien : il rassemble les questions
> que le code soulève et que seul un conseil peut clore.
>
> Il complète [`registre-des-traitements.md`](registre-des-traitements.md), qui
> couvre déjà le volet données personnelles. Les points marqués **→ registre**
> y sont détaillés et ne sont pas redits ici.

## Trois interlocuteurs distincts

| Sigle | Qui | Ce qu'il tranche |
|---|---|---|
| **JUR** | Avocat camerounais, droit du numérique et de la consommation | Sections A, B, F, G |
| **CPT** | Expert-comptable / fiscaliste camerounais | Section D, et les durées comptables du registre |
| **FIN** | Conseil réglementaire bancaire / LBC-FT | Section E |
| **DCP** | Conseil « protection des données » (peut être le même que JUR) | Section C |

## Par ordre de blocage

Trois points empêchent une mise en ligne publique tant qu'ils ne sont pas
tranchés — les autres peuvent suivre.

1. **L'identité de l'éditeur** (§A) : aucune des trois pages légales n'est
   publiable en l'état, elles affichent des marqueurs à la place des mentions
   obligatoires.
2. **Deux jeux de conditions générales coexistent et se contredisent** (§B.1) :
   il faut savoir lequel engage.
3. **L'autorisation de transfert auprès de l'APDP** (→ registre §4) : la
   totalité des traitements passe par des sous-traitants hors du Cameroun.

---

## A. Identité de l'éditeur — les mentions manquantes · JUR

Quatorze emplacements affichent aujourd'hui un marqueur `ToProvide`, rendu
visible sur le site. Ce ne sont pas des questions juridiques : ce sont des
informations que seul le responsable peut fournir, mais leur absence rend les
trois pages non conformes.

| Page | Ligne | Manque |
|---|---|---|
| `legal/mentions/page.tsx` | 29 | Dénomination et forme juridique |
| | 31 | Adresse du siège social |
| | 33 | Numéro d'immatriculation (RCCM / NIU) |
| | 35 | Capital social |
| | 37 | Numéro de TVA, le cas échéant |
| | 42 | Directeur de la publication — nom et qualité |
| | 53, 55 | Adresse électronique et téléphone de contact |
| | 60, 62, 64 | Les trois hébergeurs : applicatif, stockage objet, base |
| `legal/confidentialite/page.tsx` | 20 | Responsable du traitement : raison sociale, siège, représentant |
| | 21 | Adresse de contact dédiée aux données personnelles |
| | 99 | Annexe sous-traitants (liste nominative et pays) |
| | 128 | Nom de l'autorité de contrôle compétente |
| `legal/conditions/page.tsx` | 120, 121 | Droit applicable et juridiction compétente |

**À demander à JUR :** la formulation exacte du droit applicable et de la clause
attributive de juridiction, notamment pour les acheteurs résidant hors du
Cameroun.

---

## B. Contradictions internes relevées dans le code · JUR

### B.1 — Deux jeux de documents légaux, contradictoires, dont un est mort

`src/content/legal/` contient trois documents markdown (464 lignes) datés
« en vigueur au 1er janvier 2026, dernière mise à jour le 14 mai 2026 ».
**Aucun fichier du projet ne les importe** : les pages réellement servies sont
les `.tsx` sous `src/app/(public)/legal/`, datées du 1er août 2026.

Les deux textes divergent sur des points contractuels :

| Point | Markdown (non servi) | Pages servies + code applicatif |
|---|---|---|
| Seuil de consommation bloquant le remboursement | 20 % | 30 % — `lib/disputes.ts:45` |
| Assiette de la commission | 15 % du montant **hors taxes** | 15 % du **prix de vente** (annoncé TTC) |
| Préavis de changement tarifaire | 30 jours | 60 jours — `lib/notices.ts:45` |
| Voie de remboursement | e-mail au support | litige en self-service |
| Licence de diffusion accordée à NKAMVA | présente (art. 6.2 et 6.3) | **absente** |
| Abonnements communauté et formateur | encadrés (art. 4.3, 4.4, 7) | **non mentionnés** |

**À demander à JUR :** lequel fait foi ? Si le markdown est le texte négocié, ce
sont les pages servies qui sont fausses ; s'il est obsolète, il doit disparaître
du dépôt — un document contractuel abandonné dans un répertoire versionné
s'oppose un jour à celui qui l'a écrit.

> **Tranché le 30 septembre 2026 par le propriétaire : les pages servies font
> foi.** Les trois markdown ont été supprimés du dépôt ; leur texte reste dans
> l'historique Git (`git show dc3596a:src/content/legal/conditions.md`). Deux
> lignes du tableau ci-dessus n'existaient **que** dans le markdown et restent à
> écrire dans les pages servies, après validation JUR : la licence de diffusion
> accordée à NKAMVA (ex-art. 6.2 et 6.3) et l'encadrement des abonnements
> (ex-art. 4.3, 4.4 et 7 — voir aussi B.2).

### B.2 — Les CGU servies nient les abonnements que la plateforme facture

L'article 3 affirme : « Aucun abonnement n'est requis ». Or la plateforme
encaisse trois flux récurrents :

- **l'abonnement formateur**, mensuel ou annuel (`lib/pricing.ts`,
  [`abonnement-formateur.md`](abonnement-formateur.md)) — c'est même lui qui
  ouvre l'espace formateur ;
- **les adhésions aux communautés** (`CommunitySubscription`) ;
- **les paliers de stockage** (`lib/storage-tiers.ts`).

Le contrat servi est donc muet sur : la reconduction tacite, les modalités de
résiliation, le préavis de hausse, l'absence de remboursement au prorata, et le
comportement en cas d'échec de prélèvement.

**À demander à JUR :** rédiger les clauses correspondantes, et vérifier la
validité de la reconduction tacite au regard du droit de la consommation
camerounais.

### B.3 — « Accès sans limite de durée » contre purges programmées

L'article 3 promet un accès « acquis sans limite de durée ». Le code purge :

- les replays de séances à **24 mois** (`lib/lives.ts:49`) ;
- l'espace d'un formateur dormant à **24 mois** (`lib/subscriptions.ts:946`).

**À demander à JUR :** que devient l'accès d'un acheteur dont la ressource a
disparu par purge ou par départ du formateur ? La promesse actuelle est
intenable telle qu'écrite.

### B.4 — Aucune trace d'acceptation des conditions

La case à cocher existe (`app/auth/inscription/register-form.tsx:145-160`) mais
elle est **purement côté client** : aucune colonne du schéma Prisma n'enregistre
la version acceptée ni sa date. En litige, la plateforme ne peut pas prouver
quelles conditions ont été acceptées, ni quand.

Corollaire : l'article 9 promet d'informer avant toute modification
substantielle. Sans versionnement ni registre d'acceptation, cette promesse ne
peut pas être tenue.

**À demander à JUR :** ce que la preuve de l'acceptation doit contenir pour être
opposable — version, horodatage, adresse IP, texte intégral archivé ?

### B.5 — L'âge de 16 ans est purement déclaratif

Le formulaire fait confirmer « 16 ans ou plus » ; aucune date de naissance n'est
collectée et rien ne le vérifie.

**À demander à JUR / DCP :** quel est le seuil applicable au Cameroun pour le
consentement d'un mineur au traitement de ses données, et une déclaration
suffit-elle ? Le seuil de 16 ans a-t-il été choisi pour une raison, ou repris du
RGPD ?

### B.6 — Aucune licence n'est accordée à NKAMVA dans les CGU servies

L'article 5 fait garantir au formateur qu'il détient les droits, mais ne lui fait
accorder aucun droit d'héberger, de diffuser ni de promouvoir. La plateforme
exploite donc des œuvres sans titre exprès. La clause existe dans le markdown
mort (§B.1).

---

## C. Données personnelles · DCP

Le gros du travail est déjà instruit dans
[`registre-des-traitements.md`](registre-des-traitements.md). Ne sont rappelés
ici que les points qui appellent une décision extérieure :

- **17 mentions `[À COMPLÉTER]`** dans le registre — → registre.
- **Autorisation de transfert transfrontalier auprès de l'APDP** : tous les
  sous-traitants sont hors du Cameroun, la base elle-même est à Francfort. Il
  faut la localisation exacte et le contrat de sous-traitance de chacun
  (Supabase, Cloudflare R2, Resend, Stripe, PawaPay, LiveKit, Mux) — → registre §4.
- **Désignation d'un DPO** : obligatoire ou non dans notre cas — → registre §1.
- **Droit à la limitation du traitement** : aucun mécanisme n'existe. Faut-il
  l'outiller, et sous quelle forme ? — → registre §6.
- **Procédure de notification de violation** : destinataire nommé, délai, canal.
  Rien n'est écrit — → registre §8.
- **Information préalable des participants aux séances en direct** (voix et
  image, replays conservés 24 mois) — → registre T8.
- **Pièces d'identité des candidats formateurs** : catégorie de données à
  qualifier, et formalité préalable éventuelle — → registre T4.
- **Nommer l'autorité de contrôle** dans la politique : la phrase existe déjà,
  seul le nom manque (`legal/confidentialite/page.tsx:128`).

---

## D. Fiscal et comptable · CPT

### D.1 — La TVA : affirmée dans le contrat, absente du code

Les CGU annoncent des prix « affichés toutes taxes comprises » (art. 3). Le
module de facturation, lui, indique explicitement qu'il **n'invente aucune règle
fiscale** et ne calcule aucune taxe (`lib/invoices.ts:20`) ; la facture porte la
mention prudente « toutes taxes comprises **le cas échéant** » (`:325`).

**À demander à CPT :** la TVA est-elle due sur ces ventes de contenu numérique ?
Qui en est redevable — la plateforme ou le formateur ? À quel taux, et que doit
porter la facture ?

### D.2 — L'assiette de la commission n'est pas la même dans les deux textes

15 % du prix de vente TTC, ou 15 % du montant hors taxes (§B.1) ? L'écart change
le montant reversé à chaque formateur, sur chaque vente.

### D.3 — Qui facture qui ?

La plateforme encaisse, retient 15 %, crédite le solde du formateur et émet une
facture numérotée `NK-AAAA-NNNNNN`. Agit-elle **en son nom propre**
(commissionnaire opaque) ou **au nom et pour le compte du formateur** (mandat) ?
La réponse détermine qui doit la TVA, ce que la facture doit porter, et si le
formateur doit émettre la sienne.

### D.4 — Retenue à la source sur les versements aux formateurs

Les versements partent vers des personnes physiques dont rien ne garantit
qu'elles soient immatriculées (`lib/payouts.ts`). Y a-t-il un précompte ou une
retenue à opérer ? Une déclaration annuelle des sommes versées ?

### D.5 — Conformité de la facture

La numérotation est continue et immuable par construction
(`lib/invoices.ts:2-32`), ce qui est le bon réflexe. Reste à valider : mentions
obligatoires, exigences de la DGI en matière de facturation électronique,
conservation.

### D.6 — Durées légales de conservation comptable

Quatre lignes du registre attendent ce chiffre, et il commande la purge des
lignes protégées du journal d'audit. À confirmer au regard de l'acte uniforme
OHADA — → registre §5.

### D.7 — Le produit du change

Le même taux `unitsPerXaf` sert à encaisser et à reverser (`lib/fx.ts`). Tout
écart entre le taux appliqué et le taux réel constitue un produit.

**À demander à CPT :** comment le comptabiliser et le déclarer ?
**À demander à JUR :** doit-il être annoncé au formateur et à l'acheteur ?

---

## E. Réglementation financière · FIN

### E.1 — La plateforme détient des fonds pour le compte de tiers

Chaque formateur dispose d'un portefeuille (`Wallet.balance`), dont le solde est
immobilisé puis versé sur demande (`lib/payouts.ts`). La plateforme conserve donc
des sommes appartenant à des tiers, parfois longtemps.

**À demander à FIN :** cette activité relève-t-elle des services de paiement ou
de la monnaie électronique, et suppose-t-elle un agrément COBAC / BEAC ? Ou
reste-t-elle un simple encaissement pour compte de tiers adossé aux agréments de
PawaPay et Stripe ?

### E.2 — Obligations de lutte contre le blanchiment

Le KYC est un score maison avec seuil (`lib/kyc.ts`), et le premier retrait passe
toujours en revue manuelle (décision 25). C'est un dispositif de prudence, pas
nécessairement un dispositif conforme.

**À demander à FIN :** quelles obligations de vigilance s'appliquent, à partir de
quels seuils, et quelle durée de conservation des pièces d'identité ? Attention :
la purge actuelle les efface à **90 jours** (`lib/trainer-documents.ts:23`) — si
une obligation LBC-FT impose plus long, les deux règles s'opposent.

### E.3 — Contrôle des changes

Encaissements en devises et versements convertis (`lib/fx.ts`) : quelles
formalités BEAC, quels plafonds ?

### E.4 — Les contrats des fournisseurs de paiement

Stripe est-il ouvert à une entité camerounaise, et le rôle de collecteur pour le
compte de formateurs tiers est-il conforme à ses conditions ? Même question pour
PawaPay.

---

## F. Droit de la consommation · JUR

- **La règle de remboursement** — 14 jours, moins de 30 % consulté, et rien après
  téléchargement (`legal/conditions/page.tsx` art. 4, `lib/disputes.ts:44-45`) :
  compatible avec la loi camerounaise sur la protection du consommateur ?
  Existe-t-il un droit de rétractation pour le contenu numérique, et peut-on y
  faire renoncer par l'exécution immédiate ?
- **La suspension de l'accès pendant l'examen du litige** (art. 4) : licite ?
- **La clôture automatique du dossier après 7 jours sans réponse** : opposable ?
- **La clause de responsabilité** (art. 8) : une clause limitative est-elle
  opposable à un consommateur ?
- **L'affichage des prix en FCFA** alors qu'un acheteur peut régler en devise
  (`lib/fx.ts`) : quelle information sur le taux appliqué doit précéder le
  paiement ?

---

## G. Contenus, propriété intellectuelle, responsabilité · JUR

- **Statut de la plateforme** : hébergeur ou éditeur, au regard de la loi
  n° 2010/012 ? La modération a priori des candidatures formateur et le retrait
  discrétionnaire de ressources (art. 6) peuvent peser dans la qualification.
- **La procédure de signalement** annoncée dans les mentions légales n'est
  encadrée par aucun délai ni voie de recours. Que doit-elle contenir ?
- **Le retrait d'une ressource « à tout moment »** (art. 6) contre les droits de
  ceux qui l'ont achetée : quelle articulation ?
- **Les contenus mettant en danger des mineurs** : y a-t-il une obligation de
  signalement aux autorités, et selon quel canal ?
- **L'usage promotionnel** des contenus des formateurs : pratiqué, mais autorisé
  par aucune clause servie (§B.6).

---

## H. Sécurité — à faire qualifier · DCP + JUR

- **Des secrets réels ont figuré dans l'historique Git** (clés Stripe, Resend,
  R2, CinetPay). Indépendamment de la rotation, qui doit être faite : si le dépôt
  a été accessible, faut-il qualifier l'épisode de violation de données, et
  notifier ?
- **L'environnement de développement écrit dans le stockage de production**
  (`AWS_BUCKET_NAME=nkamva-production`). La séparation des environnements est un
  point de contrôle classique ; à qualifier avant qu'un auditeur ne le fasse.
- **La procédure de notification de violation** reste à écrire — → registre §8.

---

## I. Ce qui semble déjà en place

Utile à signaler au conseil, pour qu'il ne refasse pas le travail :

- export des données en libre-service et effacement différé de 30 jours, tous
  deux implémentés et journalisés ;
- durées de conservation datées et outillées par des jobs quotidiens
  (documents 90 j, invitations 90 j, replays 24 mois, journal 12/36 mois) ;
- journalisation de chaque consultation d'une pièce d'identité ;
- mots de passe en argon2id, double authentification TOTP à secret chiffré,
  fichiers servis uniquement par URL présignée ;
- **aucun cookie tiers** : vérifié, le code ne contient ni Google Analytics, ni
  Plausible, ni PostHog, ni Matomo, ni pixel publicitaire — l'absence de bandeau
  de consentement annoncée dans la politique est donc exacte.

---

*Mettre ce fichier à jour à chaque réponse obtenue : une question close se raye,
elle ne se supprime pas — la trace de l'arbitrage vaut autant que l'arbitrage.*
