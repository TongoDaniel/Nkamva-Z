# Invitations aux communautés — spécification

*Établie le 5 août 2026, avant toute ligne de code. Referme les deux dernières lignes
« invitation » de l'inventaire du Lot 4 (`docs/lot4-parcours-coeur.md`, lignes 198 et 209 :
« Invitations communauté magic link » et « Invitations communauté formateur »).*

Arbitrages **71 à 86**, reportés en synthèse dans `docs/decisions-nkamva.md`. Les
arbitrages 83 à 86 (l'invité qui n'a pas encore de compte) sont détaillés au § 5.3 bis.

---

## 1. Ce que l'invitation est, et ce qu'elle n'est pas

Une invitation est **un droit d'entrer**, matérialisé par un jeton dans une URL. Elle ne
crée pas de compte, ne prélève rien, et ne lève aucune décision de modération.

Trois natures ont été arbitrées, et elles se distinguent par ce qu'elles font au moment
où l'invité l'accepte :

| Nature | Ce qu'elle ouvre | Encaissement |
|---|---|---|
| **Offerte** | Une adhésion immédiate, 1 à 3 mois, sans reconduction | Aucun |
| **Payante** | Le tunnel d'adhésion existant, préqualifié | Le tarif de la communauté |
| **Privée** | Le droit d'atteindre une communauté sortie des surfaces publiques | Selon la nature portée (offerte ou payante) |

La troisième n'est pas une nature de plus sur l'invitation : c'est **un réglage de la
communauté** (`visibility`) qui rend l'invitation *nécessaire*, là où les deux premières
la rendent *avantageuse*. Une invitation vers une communauté privée est donc, dans le
modèle, une invitation offerte ou payante ordinaire — ce qui change est la porte, pas la
clé.

Ce que l'invitation ne fait pas, et qu'aucun écran ne doit laisser croire :

- elle **ne crée pas de compte** — l'invité s'inscrit ou se connecte lui-même ;
- elle **ne lève pas un bannissement** (`CommunitySubscription.bannedAt`), ni une sanction
  de compte (`User.sanctionLevel`), ni une suspension (arbitrage 79) ;
- elle **ne rembourse ni ne crédite personne** — une adhésion offerte ne produit aucun
  `Purchase`, donc aucune commission, aucun mouvement de portefeuille, aucune facture ;
- elle **ne se reconduit pas** — au terme des mois offerts, l'adhésion se ferme.

---

## 2. Les arbitrages

**71. Trois natures, deux formes** — L'invitation ouvre une adhésion offerte, une adhésion
payante, ou l'entrée dans une communauté privée. Elle prend deux formes : **nominative**
(adressée à une adresse e-mail, usage unique) ou **lien partageable** (plusieurs
acceptations, plafonné et daté).

**72. La gratuité est nominative, toujours** — Une adhésion offerte ne s'obtient que par
une invitation adressée à une adresse précise et consommable une seule fois. Aucun lien
partageable n'offre quoi que ce soit.
> Raison : un lien gratuit qui circule est une gratuité qu'on ne contrôle plus. Le
> formateur doit pouvoir dire *à qui* il offre, et le savoir après coup.

**73. Le nominatif n'est pas la gratuité** — La forme nominative porte aussi bien une
adhésion offerte qu'une adhésion payante. C'est une conséquence, pas un choix
supplémentaire : l'arbitrage 74 réserve l'entrée d'une communauté privée au nominatif, et
si le nominatif impliquait la gratuité, **une communauté privée ne pourrait jamais
encaisser un franc**. L'invitation porte donc deux attributs distincts — une *forme*
(`kind`) et une *nature* (`grant`).

**74. Le lien partageable ne mène qu'au tarif, et jamais dans une communauté privée** —
Il n'existe pas de lien partageable sur une communauté privée, et **basculer une
communauté en privé révoque tous les liens en circulation**, dans la même transaction.
Sans quoi la fermeture serait cosmétique : un lien déjà copié continuerait d'ouvrir.

**75. Le formateur offre, le membre parraine** — Le formateur émet les deux formes sur ses
propres communautés, et fixe la durée offerte entre **1 et 3 mois** par invitation. Le
membre actif n'émet **que** le lien partageable payant, pour la communauté dont il est
membre. Offrir des mois coûte de l'argent au formateur : la décision lui appartient.
> Conséquence : un membre d'une communauté **privée** ne peut émettre aucun lien
> (arbitrage 74). C'est voulu.

**76. Le parrainage ne rapporte rien au parrain** — Ni mois offert, ni remise. Le lien sert
à diffuser et à mesurer. L'attribution est conservée (`CommunitySubscription.invitationId`)
pour qu'une récompense puisse s'y greffer plus tard sans reprise de modèle.
> Raison de l'ajournement : toute contrepartie ouvre la question de son financement — part
> du formateur ou commission NkamVa —, donc les invariants financiers et le portefeuille.
> C'est un arbitrage à part entière, pas un détail d'invitation.

**77. L'adhésion offerte ne se reconduit pas** — Au terme des mois offerts, elle se ferme
comme une résiliation : accès résiduel aux ressources conservé (arbitrage 48), aucune
échéance ouverte, aucun `PAST_DUE`, aucun délai de grâce. L'ancien invité se réabonne s'il
le souhaite, et retrouve alors le rattrapage complet de l'arbitrage 44.
> Raison : facturer quelqu'un qui n'a jamais donné de moyen de paiement, sur une adhésion
> qu'il n'a jamais achetée, est une surprise — pas une conversion.

**78. Une invitation payante ne se consomme qu'au paiement confirmé** — Ouvrir le tunnel ne
consomme rien. L'usage n'est décompté (et l'invitation nominative marquée acceptée) que
dans la transaction du webhook qui fait naître l'adhésion. Un tunnel abandonné, un mobile
money refusé, un onglet fermé : l'invitation reste utilisable.
> Symétrique de la règle d'adhésion existante (« rien n'est ouvert avant que le paiement
> soit confirmé », `src/lib/memberships.ts`).

**79. Une invitation ne blanchit rien** — Elle est refusée à un compte banni de cette
communauté (`CommunitySubscription.status = BANNED`), sanctionné (`sanctionLevel = BANNED`)
ou suspendu, et au formateur de la communauté lui-même. Une porte ouverte n'est pas une
décision annulée.

**80. L'adresse invitée est une donnée personnelle** — Inviter, c'est stocker l'adresse
e-mail de quelqu'un qui n'a rien demandé et qui n'a peut-être pas de compte. Conséquences
tenues : rétention **90 jours après l'état terminal** de l'invitation (acceptée, expirée,
révoquée), purge automatique, aucun usage marketing, aucune réutilisation pour une seconde
invitation, mention dans `src/content/legal/confidentialite.md`, et inclusion dans
l'export RGPD de l'émetteur comme de l'invité.

**81. La communauté privée sort de toutes les surfaces publiques** — Annuaire
(`/communautes`), recherche transversale (`src/lib/search.ts`), panneau « Communauté » de
la fiche formateur (`src/lib/trainers.ts:162`), page publique `/communautes/[slug]`.
Cette dernière répond **404** à qui n'est ni membre ni porteur d'un jeton valide — un 403
révélerait l'existence de la communauté.
> Les membres déjà entrés **restent membres** : passer en privé ferme la porte, ça
> n'expulse personne.

**82. Un jeton invalide ne révèle rien** — Jeton inconnu, expiré, révoqué ou épuisé : la
page d'invitation affiche un message générique, sans nom de communauté, sans nom de
formateur, sans dire lequel des quatre cas s'applique. Le seul écart toléré est
l'adresse discordante (arbitrage 73 impose de guider l'invité) : « cette invitation a été
envoyée à j••••@exemple.com », adresse masquée.

---

## 3. Modèle de données

### 3.1 Nouveau modèle `CommunityInvitation`

```prisma
enum CommunityVisibility {
  PUBLIC
  PRIVATE
}

/// Forme de l'invitation — comment elle circule (arbitrage 71).
enum InvitationKind {
  /// Adressée à une adresse e-mail, consommable une seule fois.
  NOMINATIVE
  /// Lien à copier, plusieurs acceptations, plafonné et daté.
  SHARE_LINK
}

/// Nature de l'invitation — ce qu'elle ouvre (arbitrages 72 et 73).
enum InvitationGrant {
  /// 1 à 3 mois offerts. Réservée à la forme nominative.
  GIFT
  /// Mène au tunnel d'adhésion au tarif de la communauté.
  PAID
}

enum InvitationIssuerRole {
  TRAINER
  MEMBER
}

model CommunityInvitation {
  id           String               @id @default(uuid())
  communityId  String
  community    Community            @relation(fields: [communityId], references: [id], onDelete: Cascade)
  issuerId     String
  issuer       User                 @relation("InvitationsIssued", fields: [issuerId], references: [id], onDelete: Restrict)
  issuerRole   InvitationIssuerRole
  kind         InvitationKind
  grant        InvitationGrant
  /// Normalisée en minuscules. Non nulle si et seulement si NOMINATIVE.
  email        String?
  /// 1 à 3 (arbitrage 75). Non nul si et seulement si GIFT.
  giftMonths   Int?
  /// SHA-256 du jeton — le chemin de recherche des deux formes.
  tokenHash    String               @unique
  /// Le clair, **et seulement pour un SHARE_LINK** : voir § 7. Nul pour un
  /// nominatif, et une contrainte CHECK le tient.
  token        String?
  /// Huit premiers caractères du jeton, pour identifier une ligne dans une
  /// liste sans exposer de quoi l'accepter.
  tokenPrefix  String
  maxUses      Int                  @default(1)
  usesCount    Int                  @default(0)
  expiresAt    DateTime
  acceptedAt   DateTime?
  acceptedById String?
  revokedAt    DateTime?
  revokedById  String?
  /// Horodatage de la purge RGPD (arbitrage 80) : `email` est vidé, la ligne
  /// reste pour l'attribution et l'audit.
  anonymizedAt DateTime?
  subscriptions CommunitySubscription[]
  purchases     Purchase[]
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt

  @@index([communityId, createdAt])
  @@index([issuerId, createdAt])
  @@index([expiresAt])
  @@map("community_invitations")
}
```

### 3.2 Contraintes que Prisma ne sait pas exprimer

À écrire à la main dans la migration, comme la contrainte `CHECK` de `Favorite` :

```sql
-- La gratuité est nominative (arbitrage 72), et une invitation nominative
-- ne s'accepte qu'une fois (arbitrage 71).
-- ⚠️ `email IS NOT NULL OR "anonymizedAt" IS NOT NULL` : écrit d'abord sans la
-- seconde branche, ce CHECK interdisait la purge RGPD de l'arbitrage 80, qui
-- vide précisément l'adresse. Le job aurait échoué chaque nuit — mais seulement
-- après 90 jours de production. Corrigé par la migration `20260805020000`.
ALTER TABLE community_invitations ADD CONSTRAINT community_invitations_shape_check CHECK (
  (kind = 'NOMINATIVE' AND (email IS NOT NULL OR "anonymizedAt" IS NOT NULL) AND "maxUses" = 1)
  OR
  (kind = 'SHARE_LINK' AND email IS NULL AND grant = 'PAID' AND "maxUses" >= 1)
);

-- Le clair d'un lien partageable, et de lui seul (§ 7).
ALTER TABLE community_invitations ADD CONSTRAINT community_invitations_clear_token_check CHECK (
  (kind = 'SHARE_LINK' AND token IS NOT NULL) OR (kind = 'NOMINATIVE' AND token IS NULL)
);

-- 1 à 3 mois offerts, et rien d'autre (arbitrage 75).
ALTER TABLE community_invitations ADD CONSTRAINT community_invitations_gift_check CHECK (
  (grant = 'GIFT' AND "giftMonths" BETWEEN 1 AND 3)
  OR
  (grant = 'PAID' AND "giftMonths" IS NULL)
);

-- Le compteur ne dépasse pas le plafond.
ALTER TABLE community_invitations ADD CONSTRAINT community_invitations_uses_check
  CHECK ("usesCount" <= "maxUses");

-- Une seule invitation nominative ouverte par (communauté, adresse) : réinviter
-- la même adresse révoque la précédente, comme `issueOtp` invalide le code
-- précédent. Sans cet index, un formateur agacé envoie cinq liens vivants.
CREATE UNIQUE INDEX community_invitations_open_nominative_unique
  ON community_invitations ("communityId", email)
  WHERE kind = 'NOMINATIVE' AND "revokedAt" IS NULL AND "acceptedAt" IS NULL;

-- Un seul lien partageable ouvert par (communauté, émetteur) : le lien est
-- durable et régénérable, pas une collection.
CREATE UNIQUE INDEX community_invitations_open_share_link_unique
  ON community_invitations ("communityId", "issuerId")
  WHERE kind = 'SHARE_LINK' AND "revokedAt" IS NULL;
```

### 3.3 Modifications des modèles existants

```prisma
model Community {
  // ...
  /// Arbitrage 81. Passer à PRIVATE sort la communauté de toutes les surfaces
  /// publiques et révoque les liens partageables en circulation.
  visibility  CommunityVisibility   @default(PUBLIC)
  invitations CommunityInvitation[]
}

model CommunitySubscription {
  // ...
  /// ⚠️ Devient nullable. Un provider nul **est** la définition d'une adhésion
  /// offerte (arbitrage 77) : aucun moyen de paiement n'y a jamais été attaché,
  /// il n'y a donc rien avec quoi la reconduire. C'est ce que lit
  /// `renewDueMemberships` pour la fermer au lieu de la facturer.
  provider     PaymentProvider?
  /// Attribution (arbitrage 76). Nulle pour une adhésion venue du catalogue.
  invitationId String?
  invitation   CommunityInvitation? @relation(fields: [invitationId], references: [id], onDelete: SetNull)
}

model Purchase {
  // ...
  /// Porte l'invitation payante de l'initiation jusqu'au webhook : c'est là, et
  /// là seulement, qu'elle sera consommée (arbitrage 78).
  invitationId String?
  invitation   CommunityInvitation? @relation(fields: [invitationId], references: [id], onDelete: SetNull)
}

model User {
  // ...
  invitationsIssued CommunityInvitation[] @relation("InvitationsIssued")
}
```

`Purchase.acquisitionSource` (déjà présent, jamais alimenté) reçoit `'INVITATION'` sur ce
chemin — le champ existait pour ça.

### 3.4 Migration

Un seul dossier, `prisma/migrations/20260805HHMMSS_community_invitations/`. Point de
vigilance : `CommunitySubscription.provider` passe de non nul à nullable, ce qui est une
relaxation — aucune ligne existante n'est touchée, aucune reprise de données.

---

## 4. Machine à états

Le statut d'une invitation **n'est pas une colonne** : il se déduit, comme le
`gracePeriodEndsAt` d'une adhésion. Une colonne mentirait le jour où l'expiration tombe.

```
                              revokedAt ← révocation (émetteur, formateur, ou bascule
                                          en privé pour un SHARE_LINK)
                             ↗
créée ──► EN ATTENTE ──────► ACCEPTÉE        (NOMINATIVE : acceptedAt renseigné)
                    │        ÉPUISÉE         (SHARE_LINK : usesCount = maxUses)
                    └──────► EXPIRÉE         (expiresAt dépassé)
```

```ts
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXHAUSTED' | 'EXPIRED' | 'REVOKED'

export function invitationStatus(inv: CommunityInvitation, now = new Date()): InvitationStatus {
  if (inv.revokedAt) return 'REVOKED'
  if (inv.acceptedAt) return 'ACCEPTED'
  if (inv.usesCount >= inv.maxUses) return 'EXHAUSTED'
  if (inv.expiresAt <= now) return 'EXPIRED'
  return 'PENDING'
}
```

Seul `PENDING` est acceptable. Les quatre autres états sont terminaux et **ne se
rouvrent pas** : réinviter, c'est émettre une nouvelle ligne.

---

## 5. Les parcours

### 5.1 Émettre — formateur

`/formateur/invitations` (écran à créer, § 8.1).

1. Le formateur choisit une communauté (sélecteur si plusieurs), puis une forme.
2. **Nominative** : adresse e-mail + nature. Si offerte, durée 1–3 mois.
3. **Lien partageable** : rien à saisir, le lien existe déjà ou se crée à la demande.
   Refusé si la communauté est privée.
4. Le jeton est généré (32 octets, base64url), haché, stocké. Le clair part dans l'e-mail
   et **n'est plus jamais affiché** — révoquer et réémettre est le seul recours.
5. Audit `INVITATION_ISSUED`, dans la transaction.

Refus possibles : § 6.

### 5.2 Émettre — membre parrain

Panneau « Inviter » de l'espace membre `/mes-communautes/[slug]`. Un bouton, un lien, un
compteur d'acceptations, un bouton « Révoquer et régénérer ». Rien d'autre : le membre
n'a ni nature ni durée à choisir (arbitrage 75). Absent si la communauté est privée.

### 5.3 Recevoir et accepter

Page publique `/invitation/[token]`.

| Situation | Ce qui s'affiche |
|---|---|
| Jeton non `PENDING` | Message générique, aucune donnée de communauté (arbitrage 82) |
| `PENDING`, visiteur non connecté | Aperçu de la communauté + « Créer un compte » / « Se connecter », jeton préservé au retour |
| `PENDING`, connecté, adresse discordante (nominative) | « Cette invitation a été envoyée à j••••@exemple.com » — aucune acceptation possible |
| `PENDING`, connecté, tout va bien, nature **offerte** | Bouton « Rejoindre — N mois offerts », adhésion immédiate |
| `PENDING`, connecté, tout va bien, nature **payante** | Bouton « Rejoindre — X FCFA/mois », redirection vers `/adhesion/[slug]` |

### 5.3 bis. L'invité qui n'a pas encore de compte

**C'est le cas majoritaire d'une invitation nominative** : on invite quelqu'un qui n'est pas
sur NkamVa. Il mérite donc mieux qu'une case de tableau.

#### Ce que la chaîne d'authentification fait aujourd'hui

```
/auth/inscription  ──register-form.tsx:71──►  /auth/verifier-code?email=&purpose=
                   ──verify-form.tsx:50────►  /auth/connexion?verified=1
                   ──login-form.tsx:36─────►  callbackUrl ?? /accueil
```

**La destination est perdue aux deux premières étapes.** Seul le formulaire de connexion
lit un `callbackUrl`. Un invité qui s'inscrit depuis une invitation retombe sur `/accueil`,
et doit rouvrir son e-mail pour retrouver le lien. Le parcours d'invitation ne fonctionne
pas pour un nouveau venu tant que cette chaîne n'est pas rendue transparente.

Second fait à intégrer : `authorize()` (`src/lib/auth.ts:56-57`) vérifie `passwordHash`,
`deletedAt`, `suspendedAt` et la double authentification — **pas `emailVerifiedAt`**. Un
compte non vérifié se connecte. L'acceptation d'une invitation ne peut donc pas *supposer*
une adresse vérifiée : elle doit l'exiger si elle en a besoin.

#### 83. L'invitation ne crée pas de compte et ne vaut pas vérification d'adresse

*Tranché le 5 août 2026, après mise en balance explicite avec la variante « magic link ».*

Recevoir un lien ne prouve pas qu'on possède la boîte : un e-mail se transfère. Un tiers
qui reçoit une invitation transférée pourrait, si le jeton valait vérification, créer un
compte sur une adresse qui n'est pas la sienne et y poser un mot de passe — que le
propriétaire réel ne récupérerait qu'en passant par « mot de passe oublié ». L'OTP existant
ferme cette porte pour le prix d'un code à six chiffres, **qui arrive dans la même boîte
que l'invitation**.

La contrepartie ergonomique est donc faible, et le parcours reste en trois gestes :

```
clic sur le lien
  └─► /invitation/<token>   « Vous êtes invité par <Formateur> à <Communauté> »
        └─► /auth/inscription?next=/invitation/<token>&email=<adresse invitée>
              adresse imposée, champ verrouillé, mention « adresse de l'invitation »
              └─► /auth/verifier-code?email=…&next=…      code reçu dans la même boîte
                    └─► connexion automatique, retour sur /invitation/<token>
                          └─► acceptation en un clic
```

**L'alternative écartée** (le jeton vaut `emailVerifiedAt`, pas d'OTP) gagne un écran et
perd la garantie que l'adresse appartient bien à qui s'inscrit. Elle est défendable — c'est
ce que « magic link » désigne d'ordinaire, et l'inventaire du Lot 4 emploie ce mot. Elle a
été pesée et écartée : sur ce produit, l'invitation nominative garde de l'argent derrière
elle (les mois offerts de l'arbitrage 75), ce qu'un lien transféré ne doit pas pouvoir
déplacer.

> Conséquence sur le vocabulaire : la ligne « Invitations communauté **magic link** » de
> l'inventaire du Lot 4 est trompeuse. Ce qui est construit est une invitation à jeton, pas
> une authentification sans mot de passe.

#### 84. L'adresse invitée est imposée à l'inscription

Arriver sur `/auth/inscription` depuis une invitation **nominative** préremplit l'adresse et
verrouille le champ. Sans cela, l'invité saisit son adresse habituelle, va jusqu'au bout de
l'inscription et de l'OTP, revient sur l'invitation — et se prend un
`INVITATION_EMAIL_MISMATCH` après cinq minutes d'efforts. Le champ verrouillé porte la
mention « adresse à laquelle l'invitation a été envoyée » et un lien « ce n'est pas la
mienne » qui explique le recours (§ 5.3 ter).

Le **lien partageable** n'impose rien : il n'est lié à aucune adresse. L'invité s'inscrit
normalement, et c'est le cookie qui porte l'attribution (§ 5.5).

#### 85. Une invitation en attente rejoint le compte qui vient de naître

À la création d'un compte, les invitations nominatives `PENDING` adressées à cette adresse
sont rattachées au nouvel utilisateur : notification in-app `INVITATION_RECEIVED`, et une
carte sur `/accueil`. Sans cela, l'invité qui ferme son onglet au mauvais moment n'a plus
qu'un e-mail à retrouver, et le formateur voit une invitation « envoyée, jamais acceptée »
sans comprendre pourquoi.

C'est une lecture, pas une acceptation : **rien n'est accepté automatiquement**. Une
adhésion — même offerte — reste un geste de l'invité.

#### 86. Ce que le formateur ne voit pas

La liste d'invitations affiche un statut d'**invitation** (`PENDING`, `ACCEPTED`, …), jamais
un statut de **personne**. Le formateur n'apprend pas si l'adresse invitée correspond à un
compte NkamVa existant : ce serait une sonde d'énumération offerte à qui veut tester des
adresses une par une.

### 5.3 ter. Les cas de bordure, et ce qu'on en fait

| Cas | Comportement |
|---|---|
| Compte existant, **adresse concordante**, non connecté | Page neutre « Se connecter ou créer un compte ». On ne dit pas qu'un compte existe — c'est le `409 EMAIL_ALREADY_USED` de l'inscription qui l'apprendra, avec un lien vers la connexion |
| Compte existant, **adresse discordante** (invité sur `perso@`, compte `pro@`) | Refus `INVITATION_EMAIL_MISMATCH`, adresse masquée (arbitrage 82). Recours affiché : se connecter avec l'autre adresse, ou demander au formateur de réémettre. **Pas d'acceptation « avec le compte courant »** : ce serait rendre transférable une invitation qu'on a voulue nominative |
| Compte **non vérifié** (`emailVerifiedAt` nul) | Acceptation refusée tant que l'adresse n'est pas vérifiée (arbitrage 83). L'écran propose de renvoyer un code — la route `/api/auth/otp` existe |
| Adresse invitée = compte **supprimé** (`deletedAt`) | L'inscription rend `EMAIL_ALREADY_USED` (la route ne filtre pas `deletedAt`, `register/route.ts:29`). Impasse connue, **antérieure à ce lot** et hors périmètre : à signaler, pas à corriger ici |
| Compte **suspendu** | La connexion échoue déjà en `ACCOUNT_SUSPENDED` ; l'invitation n'y change rien (arbitrage 79) |
| L'invité est **formateur** d'une autre communauté | Accepté : un formateur est un utilisateur comme un autre. Seul le formateur *de cette communauté* est refusé |
| Connexion Google | Sans objet : `auth.ts` ne monte que `CredentialsProvider`. `User.googleSub` est dormant. À rouvrir le jour où un provider OAuth sera branché, car il apportera une adresse que l'invité ne choisit pas |
| L'invité ne vient jamais | L'invitation expire (14 jours), puis est purgée à +90 jours (arbitrage 80). L'adresse d'un non-inscrit ne survit pas à l'oubli |

### 5.3 quater. Ce qu'il faut changer dans l'authentification

Trois fichiers, aucun modèle. Un paramètre `next` traverse la chaîne, **validé comme chemin
interne** (commence par `/`, jamais d'URL absolue) avant tout `router.push` :

| Fichier | Changement |
|---|---|
| `src/app/auth/inscription/register-form.tsx:67-71` | Lire `next` et `email` ; propager `next` vers `/auth/verifier-code` ; verrouiller le champ e-mail quand il vient d'une invitation nominative |
| `src/app/auth/verifier-code/verify-form.tsx:50` | Propager `next` en `callbackUrl` vers `/auth/connexion` au lieu du `?verified=1` sec |
| `src/app/auth/connexion/login-form.tsx:36` | Rien — il lit déjà `callbackUrl`. C'est le seul maillon qui tient |

⚠️ Ce chaînage sert **toute** la plateforme, pas seulement les invitations : c'est aussi ce
qui manque à un visiteur qui tombe sur `/adhesion/[slug]` sans être connecté.

Le retour d'authentification préserve le jeton via `next` / `callbackUrl` — pas de jeton
dans un chemin indexable, pas de jeton en clair dans un journal serveur (les pages `/auth/*`
ne le reçoivent que comme paramètre de redirection, jamais comme identité).

### 5.4 Acceptation d'une invitation **offerte** — une seule transaction

C'est le seul chemin de la plateforme où une `CommunitySubscription` naît **sans**
webhook. Il doit donc porter lui-même tout ce que `activateMembershipForPurchase` porte.

```
BEGIN
  1. Relire l'invitation FOR UPDATE ; revalider : PENDING, communauté active,
     adresse concordante, invité ni banni ni sanctionné ni formateur de la communauté,
     aucune adhésion ouverte.
  2. UPDATE community_invitations
       SET acceptedAt = now(), acceptedById = :user, usesCount = usesCount + 1
     WHERE id = :id AND acceptedAt IS NULL          -- garde de concurrence
     → 0 ligne touchée ⇒ INVITATION_ALREADY_USED, on annule tout.
  3. CREATE CommunitySubscription {
       status: ACTIVE, provider: null, purchaseId: null,
       periodStart: now, periodEnd: now + giftMonths mois,
       invitationId: :id
     }
  4. Community.membersCount += 1
  5. Toute échéance PENDING de cet apprenant sur cette communauté → CANCELED
     (il était en cours de paiement ; on ne lui réclame pas ce qu'on lui offre).
  6. audit(tx, MEMBERSHIP_STARTED, meta { invitationId, giftMonths, gifted: true })
  7. audit(tx, INVITATION_ACCEPTED)
COMMIT

puis, hors transaction (deliverSideEffects) :
  - notify(invité)   « Bienvenue dans <communauté> — N mois offerts, jusqu'au <date> »
  - notify(formateur) « <invité> a accepté votre invitation »
```

L'étape 2 avant l'étape 3 n'est pas un détail : la garde `WHERE acceptedAt IS NULL` est ce
qui empêche deux onglets d'ouvrir deux adhésions. C'est le motif de `consumeOtp`.

### 5.5 Acceptation d'une invitation **payante**

Rien n'est consommé à l'acceptation (arbitrage 78).

```
/invitation/[token]  ──► pose un cookie httpOnly `nk_invitation` = <id>
                         SameSite=Lax, path=/, 24 h
                    ──► redirige vers /adhesion/[slug]

/api/communities/[slug]/adhesion (POST)
    lit le cookie, revalide l'invitation (PENDING, même communauté, adresse concordante
    si nominative), et passe `invitationId` à initiateMembershipPayment()
    → Purchase.invitationId + acquisitionSource = 'INVITATION'

webhook Stripe / CinetPay ──► creditWalletOnPurchase ──► activateMembershipForPurchase
    dans la même transaction, si purchase.invitationId :
      - usesCount += 1, et acceptedAt/acceptedById si NOMINATIVE
        (UPDATE gardé sur usesCount < maxUses ⇒ sinon on laisse passer l'adhésion
         payée mais on journalise INVITATION_OVERRUN : le paiement prime, il est
         encaissé, et refuser l'accès à quelqu'un qui a payé serait indéfendable)
      - CommunitySubscription.invitationId = purchase.invitationId
      - audit INVITATION_ACCEPTED
```

Le cookie porte l'**identifiant**, pas le jeton : un cookie qui fuite ne se rejoue pas
ailleurs, et il est revalidé à chaque usage de toute façon.

⚠️ `path=/` et 24 h ne sont pas des largesses : c'est ce qu'il faut pour que l'attribution
survive à l'inscription, à l'OTP et à la connexion d'un invité qui n'avait pas de compte
(§ 5.3 bis). Un cookie limité à `/adhesion` serait perdu dès `/auth/inscription` — c'est-à-
dire précisément dans le cas majoritaire du lien de parrainage, qui vise des gens qui ne
sont pas encore sur NkamVa.

### 5.6 Communauté privée

- `getPublicCommunity(slug)` gagne un paramètre d'appelant : sans membre ni invitation
  valide, elle rend `null` sur une privée, et la page appelle `notFound()`.
- `listPublicCommunities`, `search.ts`, `getPublicTrainer` filtrent `visibility: 'PUBLIC'`.
- Bascule vers `PRIVATE` : dans la même transaction, tous les `SHARE_LINK` non révoqués de
  la communauté passent `revokedAt = now()` avec `revokedById = <formateur>`, et un audit
  `INVITATION_REVOKED_BY_VISIBILITY` porte le compte. Le formateur en est prévenu **avant**
  de confirmer — « 3 liens de parrainage cesseront de fonctionner ».
- Bascule vers `PUBLIC` : rien n'est ressuscité. Les liens révoqués restent morts.

---

## 6. Refus — codes et statuts HTTP

Conventions Lot 0 : `{ error: { code, message } }`, SCREAMING_SNAKE_CASE.

| Code | HTTP | Quand |
|---|---|---|
| `INVITATION_NOT_FOUND` | 404 | Jeton inconnu — et tout jeton non `PENDING` vu de l'extérieur (arbitrage 82) |
| `INVITATION_EMAIL_MISMATCH` | 403 | Nominative, adresse du compte ≠ adresse invitée |
| `INVITATION_ALREADY_USED` | 409 | Course entre deux acceptations |
| `COMMUNITY_NOT_FOUND` | 404 | Communauté close ou inexistante |
| `ALREADY_MEMBER` | 422 | Adhésion déjà ouverte (`ACTIVE`, `PAST_DUE` ou `BANNED`) |
| `CANNOT_JOIN_OWN_COMMUNITY` | 422 | L'invité est le formateur de la communauté |
| `MEMBERSHIP_BANNED` | 403 | Banni de cette communauté (arbitrage 79) |
| `ACCOUNT_BANNED` | 403 | `User.sanctionLevel = BANNED` ou compte suspendu |
| `INVITE_LINK_FORBIDDEN_ON_PRIVATE` | 422 | Lien partageable demandé sur une communauté privée |
| `GIFT_REQUIRES_NOMINATIVE` | 422 | Nature offerte sur une forme partageable |
| `GIFT_MONTHS_OUT_OF_RANGE` | 400 | Hors 1–3 |
| `MEMBER_CANNOT_GIFT` | 403 | Un membre tente d'émettre une invitation offerte |
| `NOT_A_MEMBER` | 403 | Un non-membre tente d'émettre un lien de parrainage |
| `INVITATION_QUOTA_EXCEEDED` | 429 | Quota d'émission dépassé (§ 10) |

---

## 7. Sécurité et vie privée

| Sujet | Décision |
|---|---|
| Entropie du jeton | 32 octets `crypto.randomBytes`, encodés base64url (43 caractères) |
| Stockage | `tokenHash` en **SHA-256** pour les deux formes — c'est le chemin de recherche. Pas d'argon2 : on cherche *par* le jeton, et 256 bits d'entropie ne se brute-forcent pas. Le clair n'est jamais journalisé |
| Clair en base | **Uniquement pour un `SHARE_LINK`** (colonne `token`, migration `20260805010000`), tenu par une contrainte `CHECK`. Un lien de parrainage est fait pour être recopié, donc réaffiché : haché seul, il faudrait le régénérer à chaque consultation, ce qui tuerait le lien déjà partagé. Les enjeux diffèrent — un lien partageable fuité fait adhérer **au tarif plein**, un nominatif fuité coûte les mois offerts au formateur |
| Réaffichage | Lien partageable : à volonté. **Nominatif : jamais** — un lien perdu se révoque et se réémet |
| Durée de vie | Nominative **14 jours**, lien partageable **90 jours** (§ 10, valeurs nommées) |
| Rejeu | Nominative : garde SQL sur `acceptedAt IS NULL`. Partageable : garde sur `usesCount < maxUses` |
| Énumération | Toute erreur d'invitation rend le même 404 générique (arbitrage 82) |
| Fuite par l'URL | Le jeton ne traverse jamais `/auth/*` autrement que dans `callbackUrl` ; le tunnel d'adhésion travaille sur un cookie httpOnly portant l'identifiant |
| Rate limit | `INVITATION_ISSUE` et `INVITATION_ACCEPT` dans `RATE_LIMITS`, **branchés sur les routes** — ne pas répéter l'écart connu des Lots 1-3 |
| Donnée personnelle | Arbitrage 80 : rétention 90 jours après état terminal, purge planifiée, mention dans la politique de confidentialité, présence dans l'export RGPD |
| Journalisation | `INVITATION_ISSUED`, `INVITATION_ACCEPTED`, `INVITATION_REVOKED`, `INVITATION_REVOKED_BY_VISIBILITY`, `INVITATION_OVERRUN`, `COMMUNITY_VISIBILITY_CHANGED` |

---

## 8. Surface

### 8.1 Écrans

| Route | Qui | Contenu |
|---|---|---|
| `/invitation/[token]` | Public | Les cinq états du § 5.3. Aucune donnée sur un jeton non valide |
| `/formateur/invitations` | Formateur | Émission (nominative / lien), liste paginée avec statut, adresse, nature, durée offerte, compteur d'usages, expiration ; révocation. Sélecteur de communauté si plusieurs |
| `/mes-communautes/[slug]` | Membre | Panneau « Inviter » : lien, compteur, révoquer/régénérer |
| `/formateur/invitations` (bloc réglage) | Formateur | Bascule public/privé de la communauté, avec l'avertissement de révocation |

Entrée de navigation à ajouter dans `src/components/layouts/app-shell.tsx` (bloc formateur,
après « Mes publications »). Aucune autre page formateur n'est créée : « Communauté
formateur (posts) » et « Membres & apprenants » restent hors périmètre.

### 8.2 Routes API

```
GET    /api/invitations/[token]                                  public   aperçu
POST   /api/invitations/[token]/accept                           auth     accepte (offerte)
                                                                          ou pose le cookie (payante)

GET    /api/trainer/communities/[communityId]/invitations        formateur liste paginée
POST   /api/trainer/communities/[communityId]/invitations        formateur émission
DELETE /api/trainer/communities/[communityId]/invitations/[id]   formateur révocation
PATCH  /api/trainer/communities/[communityId]                    formateur visibilité
                                                                          (route à créer)

POST   /api/communities/[slug]/invitation-link                   membre   crée ou rend le sien
DELETE /api/communities/[slug]/invitation-link                   membre   révoque
```

### 8.3 Service

`src/lib/invitations.ts` — un fichier, à l'image de `memberships.ts` :

```
issueNominativeInvitation()   issueShareLink()      revokeInvitation()
previewInvitation()           acceptGiftInvitation()
consumeInvitationForPurchase()   ← appelée par activateMembershipForPurchase
setCommunityVisibility()      listCommunityInvitations()
invitationStatus()            purgeStaleInvitations()   ← job
```

### 8.4 E-mail

`renderInvitationEmail()` dans `src/lib/email.ts`, sur `renderSimpleEmail` (pas de
`react-email`, toujours non installé) :

> **Objet** — « <Formateur> vous invite à rejoindre <Communauté> sur NkamVa »
>
> Corps : qui invite, ce que l'invitation ouvre (« 2 mois offerts » ou le tarif), le
> bouton, la date d'expiration, et la phrase qui manque partout ailleurs : *« Vous recevez
> cet e-mail parce que <Formateur> a saisi votre adresse. Si cela ne vous dit rien,
> ignorez-le : aucun compte n'a été créé. »*

---

## 9. Impacts sur l'existant

| Fichier | Ce qui change |
|---|---|
| `prisma/schema.prisma` | 4 enums, 1 modèle, `Community.visibility`, `CommunitySubscription.provider` nullable + `invitationId`, `Purchase.invitationId`, relation sur `User` |
| `src/lib/memberships.ts` | `activateMembershipForPurchase` consomme l'invitation et reporte `invitationId` ; `renewDueMemberships` ferme les adhésions offertes (`provider === null`) avec le motif `GIFT_ENDED` au lieu d'ouvrir une échéance ; `initiateMembershipPayment` accepte un `invitationId` optionnel |
| `src/lib/communities.ts` | `listPublicCommunities` et `getPublicCommunity` filtrent la visibilité |
| `src/lib/search.ts` | Le volet communautés filtre `visibility: 'PUBLIC'` |
| `src/lib/trainers.ts` | Le panneau « Communauté » (ligne 162) ignore les privées |
| `src/lib/jobs.ts` | Deux entrées : `INVITATION_PURGE`, `GIFT_MEMBERSHIP_ENDING_NOTICE` |
| `src/lib/rate-limit.ts` | `INVITATION_ISSUE`, `INVITATION_ACCEPT` |
| `src/lib/email.ts` | `renderInvitationEmail` |
| `src/app/api/me/gdpr-export` | Invitations émises et reçues |
| `src/app/auth/inscription/register-form.tsx` | Propage `next`, verrouille l'adresse invitée (arbitrages 83-84) |
| `src/app/auth/verifier-code/verify-form.tsx` | Propage `next` en `callbackUrl` au lieu de `?verified=1` |
| `src/app/api/auth/register/route.ts` | Rattache les invitations `PENDING` de l'adresse au compte créé (arbitrage 85) |
| `src/components/layouts/app-shell.tsx` | Entrée « Invitations » côté formateur |
| `src/content/legal/confidentialite.md` | Traitement des adresses invitées, rétention 90 jours |
| `docs/lot4-parcours-coeur.md` | Les deux lignes ❌ passent à ✅ |

⚠️ **Le point le plus délicat de toute la spec** : `provider` nullable sur
`CommunitySubscription`. Tout code qui lit ce champ doit être relu — `renewDueMemberships`
le recopie aujourd'hui sur le `Purchase` du renouvellement, ce qui planterait sur une
adhésion offerte si la branche de fermeture n'était pas prise avant. C'est précisément
pourquoi la branche de fermeture se teste en premier dans la boucle.

---

## 10. Valeurs nommées, non arbitrées

À l'image de `SUBSCRIPTION_GRACE_DAYS` et `MEMBERSHIP_GRACE_DAYS` : isolées et nommées pour
être discutées, pas découvertes au fond d'une condition.

```ts
export const INVITATION_NOMINATIVE_TTL_DAYS = 14
export const INVITATION_SHARE_LINK_TTL_DAYS = 90
export const INVITATION_SHARE_LINK_MAX_USES = 25
export const INVITATION_GIFT_MAX_MONTHS = 3        // ← arbitré (75)
export const INVITATION_GIFT_MONTHLY_QUOTA = 20    // invitations offertes / communauté / 30 jours glissants
export const GIFT_ENDING_NOTICE_DAYS = 3           // préavis avant la fin des mois offerts
```

Questions laissées ouvertes, à verser aux « Points non arbitrés » :

- **Le quota de gratuité** (20/mois/communauté) est une valeur de sécurité, pas une règle
  produit. Faut-il un quota du tout, ou la commission perdue est-elle l'affaire du seul
  formateur ?
- **Le plafond du lien partageable** (25 acceptations, 90 jours) : plafonner un lien de
  parrainage payant n'a pas d'autre justification que la maîtrise du dégât en cas de fuite.
- **La contrepartie du parrain** (arbitrage 76) est ajournée, pas refusée.
- **Le préavis avant la fin des mois offerts** : 3 jours retenus, jamais discutés — même
  question ouverte que le préavis de purge d'un replay (arbitrage 51).

---

## 11. Jobs et notifications

| Job | Cadence | Ce qu'il fait |
|---|---|---|
| `INVITATION_PURGE` | 03:15 quotidien | Vide `email` des invitations terminales depuis plus de 90 jours, pose `anonymizedAt` (arbitrage 80). La ligne survit pour l'attribution |
| `GIFT_MEMBERSHIP_ENDING_NOTICE` | 08:00 quotidien | Prévient l'invité 3 jours avant la fin des mois offerts, et lui dit comment rester |

Notifications in-app (`notify`), toutes via `deliverSideEffects` :

| Type | Destinataire |
|---|---|
| `INVITATION_RECEIVED` | L'invité, s'il a déjà un compte (en plus de l'e-mail) |
| `INVITATION_ACCEPTED` | Le formateur émetteur |
| `MEMBERSHIP_STARTED` (variante offerte) | L'invité |
| `GIFT_MEMBERSHIP_ENDING` | L'invité, J-3 |
| `MEMBERSHIP_ENDED` (motif `GIFT_ENDED`) | L'invité, au terme |

---

## 12. Tests — `tests/invitations.test.ts`

Postgres réel, `fileParallelism: false`, comme les 33 fichiers existants.

**Règles d'émission**
1. Un membre ne peut pas émettre d'invitation offerte → `MEMBER_CANNOT_GIFT`.
2. Un non-membre ne peut pas émettre de lien de parrainage → `NOT_A_MEMBER`.
3. `giftMonths = 0` et `giftMonths = 4` sont refusés ; 1, 2, 3 passent.
4. Lien partageable refusé sur une communauté privée.
5. Réinviter la même adresse révoque la précédente ; l'index partiel n'est jamais violé.
6. Le jeton en clair n'apparaît dans aucune ligne de la table.

**Acceptation**
7. Offerte : l'adhésion naît `ACTIVE`, `provider` nul, `periodEnd = now + N mois`,
   `membersCount` incrémenté de 1.
8. Deux acceptations concurrentes du même jeton nominatif : une seule adhésion, la seconde
   rend `INVITATION_ALREADY_USED`.
9. Adresse discordante → `INVITATION_EMAIL_MISMATCH`, invitation intacte.
10. Banni de la communauté → refus, et **aucune** adhésion créée (arbitrage 79).
11. Compte `sanctionLevel = BANNED` → refus.
12. Déjà membre → `ALREADY_MEMBER`, invitation non consommée.
13. Une échéance `PENDING` en cours est annulée par l'acceptation d'une invitation offerte.

**Payante (arbitrage 78)**
14. Ouvrir le tunnel ne bouge ni `usesCount` ni `acceptedAt`.
15. Abandonner le tunnel laisse l'invitation utilisable.
16. Le webhook confirmé consomme l'invitation **et** reporte `invitationId` sur l'adhésion.
17. Un lien épuisé pendant un paiement en vol : l'adhésion se crée quand même,
    `INVITATION_OVERRUN` est journalisé.

**Cycle de vie**
18. `renewDueMemberships` **ferme** une adhésion offerte arrivée à terme (motif
    `GIFT_ENDED`) et n'ouvre aucun `Purchase`.
19. L'ancien invité conserve l'accès résiduel de l'arbitrage 48.
20. Un jeton expiré rend le même 404 générique qu'un jeton inconnu.

**Communauté privée**
21. Absente de `listPublicCommunities`, de `search()` et du panneau de la fiche formateur.
22. `/communautes/[slug]` répond 404 à un visiteur sans jeton, sert la page à un membre.
23. La bascule en privé révoque les liens partageables ouverts, et le journal le dit.
24. La bascule retour en public ne ressuscite rien.

**L'invité sans compte (§ 5.3 bis)**
25. Inscription depuis une invitation nominative : le compte naît avec l'adresse invitée, et
    l'invitation lui est rattachée (`INVITATION_RECEIVED`) sans être acceptée.
26. Un compte `emailVerifiedAt` nul ne peut pas accepter (arbitrage 83).
27. Après vérification OTP, l'acceptation passe — même invitation, même jeton.
28. Le paramètre `next` ne suit que des chemins internes : `//evil.tld` et
    `https://evil.tld` sont rejetés.
29. Lien de parrainage : le cookie survit à inscription + OTP + connexion, et l'attribution
    arrive bien sur l'adhésion payée.
30. L'inscription avec une adresse **autre** que l'adresse invitée reste possible (le
    verrouillage est côté écran), mais l'acceptation rend alors `INVITATION_EMAIL_MISMATCH`
    — le refus est bien côté serveur, pas côté formulaire.

**Vie privée**
31. `purgeStaleInvitations` vide l'adresse au-delà de 90 jours et conserve l'attribution.
32. La liste d'invitations du formateur ne révèle jamais l'existence d'un compte pour une
    adresse invitée (arbitrage 86).

---

## 13. Hors périmètre, explicitement

- **Toute contrepartie de parrainage** (arbitrage 76) — ajournée, pas refusée.
- **L'invitation par un administrateur** — écartée au cadrage : un geste de support n'a pas
  été demandé, et il demanderait sa propre traçabilité.
- **L'invitation à un live seul**, sans adhésion — l'arbitrage 46 fait de la communauté sa
  propre limite ; il n'y a rien à inviter en dehors d'elle.
- **Les pages formateur « posts » et « membres & apprenants »** — restent ❌ à l'inventaire.
- **L'import d'une liste d'adresses** — l'émission est unitaire. Un import de masse
  transformerait l'arbitrage 80 en tout autre sujet.
