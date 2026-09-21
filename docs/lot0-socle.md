# Lot 0 — SOCLE : Spécification d'implémentation

> **État réel au disque** : vérifié le 3 août 2026 (`tsc --noEmit` vert, `vitest run`
> 216/216 sur Postgres réel).
> Ce document reflète exactement ce qui existe sur le disque, pas ce qui était prévu.
> La version précédente datait du 31 juillet et décrivait un état — SQLite,
> `instrumentation.ts` absent, 46 routes manquantes — qui n'a plus cours.

---

## 1. Configuration

| Fichier | État | Contenu réel |
|---|---|---|
| `.env` | ✅ PostgreSQL | `DATABASE_URL="postgresql://…"` (Supabase de dev). `DIRECT_URL` est requis par `prisma migrate` |
| `package.json` | ✅ | Toutes les dépendances installées, `stripe` compris (voir §7) |
| `prisma/schema.prisma` | ✅ 1 062 lignes | Provider `postgresql`, 4 migrations versionnées |
| `vitest.config.ts` | ✅ | Alias `@/`, `fileParallelism: false` (base partagée nettoyée par TRUNCATE) |
| `eslint.config.mjs` | ✅ | `ignores` à jour ; le dossier `audit/` de la maquette n'existe plus |
| `src/instrumentation.ts` | ✅ | Démarre les jobs planifiés, sauf runtime Edge / `NODE_ENV=test` / `DISABLE_SCHEDULED_JOBS=1` |
| `src/types/next-auth.d.ts` | ✅ | Augmentation `Session`/`User`/`JWT` avec `id`, `role`, `adminRole`, `trainerId`, `sessionsValidAfter` |
| `src/middleware.ts` | ✅ | Protection des pages par préfixe + garde `ADMIN`, redirection vers `/auth/connexion?callbackUrl=…` |

### 1.1 Base de données

PostgreSQL, migrations Prisma versionnées, **jamais `db:push`** :

```
20260731140243_init
20260731140302_community_subscriptions_active_unique_index
20260803123616_reports_and_platform_pricing
20260803133315_subscription_lifecycle
```

---

## 2. Services socles (`src/lib/`)

| Fichier | État | Notes |
|---|---|---|
| `db.ts` | ✅ | Singleton PrismaClient avec `dotenv` explicite |
| `types.ts` | ✅ | Type `PrismaTransaction` |
| `audit.ts` | ✅ | `audit(tx, params)` transactionnel + `auditStandalone(params)` |
| `api.ts` | ✅ | Enveloppe `{ data, meta }`, `DOMAIN_ERRORS` mutualisé, RBAC, `parseBody`, `isPublicRoute(method, path)` |
| `auth.ts` | ✅ | NextAuth v4 Credentials, callbacks jwt/session, `sessionsValidAfter`, **plafond de connexion** (§9.1) |
| `password.ts` | ✅ | argon2id via `@node-rs/argon2` |
| `otp.ts` | ✅ | Émission / consommation, TTL 10 min, 5 tentatives |
| `rate-limit.ts` | ✅ | Compteur en mémoire, purge périodique, `peek`/`record`/`clear` (§9.1) |
| `session-validity.ts` | ✅ | `isSessionRevoked()`, partagé par le middleware et le callback `session` |
| `s3.ts` | ✅ | R2 présigné, `validateMagicNumber` (5 formats), `headObject`, `getRange`, `deleteObject` |
| `wallet.ts` | ✅ | `creditWalletOnPurchase` idempotent (voir §10) |
| `email.ts` | ✅ | `sendEmail()` + `renderSimpleEmail()` — gabarit à la marque, HTML **et** texte rendus d'une seule source |
| `notification.ts` | ✅ | `notify()`, `notifyAdminSubRole()`, `listMyNotifications()`, `countUnreadNotifications()`, `markNotificationsRead()`, `deliverSideEffects()` (effets de bord après commit), `absoluteUrl()` |
| `jobs.ts` + `jobs/` | ✅ | 12 jobs `node-cron`, démarrés par `instrumentation.ts` |

Les services des Lots 1 à 4 (`trainer-applications`, `disputes`, `kyc`, `payouts`,
`catalog`, `courses`, `purchases`, `access`, …) existent tous — voir
`docs/decisions-nkamva.md` §« Résumé de l'état d'implémentation ».

---

## 3. Routes API

**87 routes** sur le disque. Celles du périmètre Lot 0 :

| Route | Méthode | Notes |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | Point de montage NextAuth v4 sur `authOptions` |
| `/api/auth/register` | POST | Crée un `LEARNER` non vérifié, audit `USER_REGISTERED`, émet un OTP. 409 `EMAIL_ALREADY_USED` (index unique en filet sur la course) |
| `/api/auth/otp` | POST | Envoi d'un code à 6 chiffres. Réponse identique que le compte existe ou non (pas d'énumération) |
| `/api/auth/verify-otp` | POST | Vérifie l'adresse, pose `emailVerifiedAt`, audit `EMAIL_VERIFIED` |
| `/api/auth/reset-password` | POST | Consomme l'OTP, remplace le hash, bumpe `sessionsValidAfter`, audit `PASSWORD_RESET` |
| `/api/health` | GET | `SELECT 1` sur Postgres, 503 `DATABASE_UNAVAILABLE` sinon |
| `/api/contact` | POST | Formulaire public, plafonné à 5/h par IP, aucun stockage du message |

`EmailOtp` ne porte pas de colonne « purpose » : un code vaut preuve de contrôle de
l'adresse, quel que soit l'usage. Émettre un nouveau code invalide donc le précédent
pour cette adresse. TTL 10 minutes, 5 tentatives maximum (`src/lib/otp.ts`).

> `/api/route.ts` — le « Hello, world! » du template initial — a été **supprimé** le
> 3 août. Il ne pouvait pas être déclaré public sans que le préfixe `/api` ne rende
> publiques toutes les routes GET ; `/api/health` couvre déjà le smoke test.

---

## 4. Pages frontend

Le design vient de la maquette `Nkamva.zip`, reconstruit en Tailwind + shadcn. Les
tokens (papier chaud `#f6f3ec`, accent bleu `#1c5ed0`, navy `#022342`, Bricolage
Grotesque + Instrument Sans) vivent dans `src/app/globals.css` et remappent les tokens
shadcn : les primitives `ui/` adoptent le style NKAMVA sans surcouche. Le vert forêt est
réservé à l'admin, via `.nk-admin`.

**66 pages** sur le disque. Celles du périmètre Lot 0 :

### 4.1 Socle

| Fichier | État | Contenu réel |
|---|---|---|
| `src/app/globals.css` | ✅ | Tokens NKAMVA + remappage shadcn, halo de fond, animations `nk-reveal` / `nk-marquee` |
| `src/app/layout.tsx` | ✅ | `lang="fr"`, polices Google, `Providers`, `Toaster` de **`sonner`** |
| `src/app/providers.tsx` | ✅ | SessionProvider NextAuth + QueryClientProvider |
| `src/components/nk/*` | ✅ | Primitives de la maquette (`Btn`, `Chip`, `Cover`, `ResourceCard`, `EmptyState`, `PageHead`, `Wizard`, `DataTable`…) |
| `src/components/layouts/*` | ✅ | `public-shell`, `app-shell`, `admin-shell`, `auth-shell` |
| `src/features/demo/*` | ✅ | Jeu de données de la maquette — **seul endroit contenant du faux contenu** |

> ⚠️ Une seule génération de composants vit dans `src/components`. Les tokens
> `text-ink2`, `line2`, `brand-t`, la classe `.wrap` et les fichiers `nk/btn.tsx`,
> `nk/price.tsx`, `layout/site-header` appartenaient à une génération morte dont les
> classes **ne résolvaient plus**, sans casser ni le build ni le typecheck. Ils ont été
> supprimés le 2 août : les revoir apparaître est une régression.

### 4.2 Pages publiques — groupe `(public)`

`/`, `/ressources` · `/ressources/[slug]`, `/formateurs` · `/formateurs/[trainerId]`,
`/communautes` · `/communautes/[slug]`, `/tarifs`, `/favoris`, `/aide`, `/contact`,
`/legal/conditions` · `/legal/confidentialite` · `/legal/mentions`. Hors groupe :
`/devenir-formateur`.

### 4.3 Pages d'authentification

| Route | État | Notes |
|---|---|---|
| `/auth/connexion` | ✅ | Credentials, `callbackUrl` (défaut `/accueil`), messages dédiés `ACCOUNT_SUSPENDED` et `TOO_MANY_ATTEMPTS` |
| `/auth/inscription` | ✅ | Compte + acceptation CGU, puis redirection vers la vérification |
| `/auth/verifier-code` | ✅ | Saisie du code à 6 chiffres, renvoi de code |
| `/auth/mot-de-passe-oublie` · `/auth/nouveau-mot-de-passe` | ✅ | Demande de code, puis code + nouveau mot de passe |
| `/auth/erreur` | ✅ | Cible de `authOptions.pages.error` |
| `not-found.tsx` · `error.tsx` | ✅ | 404 et erreur applicative |

Tous les formulaires sont en `noValidate` : `type="email"` ne valide rien de fiable, les
règles vivent dans `src/lib/validation.ts`.

### 4.4 `/mon-compte`

Redirection permanente vers `/profil` depuis le 3 août. C'était l'écran de compte du
socle, écrit avant l'existence de l'espace connecté ; `/profil` le remplace entièrement
(informations, mot de passe, export et suppression des données) dans le shell
applicatif. L'URL est gardée parce qu'elle a été diffusée.

Corollaire dans `middleware.ts` : une session déjà ouverte sur une page d'auth part vers
`/accueil` (et non plus `/mon-compte`), et le refus d'accès `/admin` renvoie sur
`/accueil?erreur=acces-refuse`, où la bannière est rendue.

---

## 5. Tests

`npx vitest run` — **216 tests, 19 fichiers, tous verts** sur Postgres réel (3 août 2026).

| Fichier | Contenu |
|---|---|
| `tests/setup.ts` | PrismaClient + `cleanDatabase()` via TRUNCATE CASCADE, neutralisation des secrets réels du `.env` de dev |
| `tests/lot0-auth.test.ts` | 16 tests : cycle de vie OTP, `register`, `reset-password`, invalidation ciblée des sessions, **plafond de connexion** (5 tests) |
| `tests/env-hermetic.test.ts` | Garde-fou : la suite ne doit toucher aucun service réel |
| `tests/auth-session.test.ts`, `lot1-*`, `lot2-*`, `lot3-*`, `lot4-*`, `jobs`, … | Voir `docs/decisions-nkamva.md` |

---

## 6. Schéma Prisma

`prisma/schema.prisma` (1 062 lignes) contient tous les modèles des Lots 0-4, plus les
signalements, la tarification plateforme et le cycle de vie des abonnements.

---

## 7. Dépendances

Installées : `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@node-rs/argon2`,
`dotenv`, `next-auth` 4.24, `node-cron` 4.6, `resend` 6.18, `sonner`, `stripe` 22.4,
`vitest`, `zod`, plus le socle du template (Next 16, React 19, Prisma 6, TanStack Query
5, react-hook-form, framer-motion, recharts, lucide-react, 48 composants shadcn/ui).

Non installées, volontairement : `file-type` (la validation des magic numbers est écrite
à la main dans `s3.ts`), `react-email` (les emails passent par `renderSimpleEmail`),
`next-intl` est présent mais inutilisé — décision : pas d'i18n, français en dur.

---

## 8. Conventions transverses

| Convention | Réel |
|---|---|
| Type d'ID | UUID v4 (`@default(uuid())`) |
| Préfixe routes | `/api` |
| Enveloppe réponse | `{ data, ...(meta ? { meta } : {}) }` |
| Erreurs | `{ error: { code, message, details? } }`, 422 pour les règles métier |
| Montants | `Int` en FCFA, jamais `Float` |
| Pagination | `page` + `pageSize` (max 50) |
| Toast | `sonner` |
| Hachage | argon2id |
| Auth | NextAuth v4, stratégie JWT, 30 jours |
| Stockage | Cloudflare R2 |
| Email | Resend ; sans `RESEND_API_KEY`, `sendEmail` journalise en console (mode dev) |
| Jobs | `node-cron` in-process, démarrés par `instrumentation.ts` |
| Audit | `AuditLog` écrit **dans la transaction métier** |
| Effets de bord | Notifications et emails partent **après** le commit, via `deliverSideEffects` |

---

## 9. Matrice de permissions RBAC

Implémentée dans `src/lib/api.ts` : `requireAuth()`, `requireRole(...)`,
`requireAdminSubRole(...)`, `requireTrainer()`, `isPublicRoute(method, path)`.

Côté pages, `src/middleware.ts` applique la même logique en amont du rendu. Les préfixes
protégés couvrent `/mon-compte`, `/accueil`, `/achat`, `/profil`, `/candidature`,
`/mes-achats`, `/mes-ressources`, `/mes-litiges`, `/mes-lives`, `/messagerie`,
`/notifications`, `/formateur`, `/admin`. Le layout du groupe `(app)` redouble la garde :
si le middleware est un jour désactivé, aucune page de l'espace connecté ne reste
accessible.

L'invalidation ciblée passe par `isSessionRevoked()` (`src/lib/session-validity.ts`),
partagé avec le callback `session`. La comparaison se fait à la seconde : `iat` est en
secondes entières, une comparaison en millisecondes rejetait à tort une reconnexion faite
dans la même seconde qu'une révocation.

**Routes publiques** (`PUBLIC_ROUTES`, appariées par méthode **et** préfixe) : POST sur
`/api/auth/register`, `/api/auth/otp`, `/api/auth/verify-otp`, `/api/auth/reset-password`,
`/api/contact` et `/api/webhooks/` ; GET sur `/api/catalog/`, `/api/courses/`,
`/api/trainers`, `/api/communities`, `/api/tarifs`, `/api/legal/`, `/api/contact`,
`/api/aide`, `/api/health`. Le couple (méthode, préfixe) est ce qui empêche un préfixe
large d'ouvrir des routes voisines.

### 9.1 Plafond de tentatives de connexion

`authorizeCredentials()` (`src/lib/auth.ts`) applique `RATE_LIMITS.LOGIN` — 5 échecs par
minute — sur **deux compteurs simultanés** :

- `ip:<adresse>` arrête le balayage d'un dictionnaire d'adresses depuis un même poste ;
- `email:<adresse>` arrête le martèlement d'un compte unique depuis des IP tournantes.

Un seul des deux laisserait passer l'autre attaque. Trois règles en découlent :

1. **Seuls les échecs comptent** (`peekRateLimit` puis `recordRateLimitHit`), sinon six
   connexions légitimes en une minute verrouillent le compte ;
2. **une réussite remet les compteurs à zéro** (`clearRateLimit`) ;
3. **une adresse inconnue et un compte suspendu consomment le même quota** qu'un compte
   réel : autrement le plafond devient un oracle d'énumération.

Au-delà du plafond, `authorize` lève `TOO_MANY_ATTEMPTS`, rendu par `/auth/connexion` et
`/auth/erreur`.

> Piège : `CredentialsProvider()` renvoie un objet dont `authorize` est le stub
> `() => null` de NextAuth ; la fonction fournie n'est lisible que sous `.options`. Un
> test qui appelle `providers[0].authorize` teste le stub et passe quoi qu'il arrive.
> D'où l'extraction de `authorizeCredentials`, appelée directement par les tests, plus un
> test qui vérifie qu'elle est bien celle câblée sur le provider.

---

## 10. Crédit wallet idempotent

`src/lib/wallet.ts` — `creditWalletOnPurchase(tx, providerTransactionId, provider)` :

1. `updateMany WHERE providerStatus = PENDING` → si `count = 0`, déjà traité ;
2. `upsert` du wallet en filet ;
3. audit `PURCHASE_SUCCEEDED` (+ `WALLET_AUTO_CREATED` si le wallet a été créé) ;
4. audit `WEBHOOK_DUPLICATE_IGNORED` si doublon.

Déclenché par les webhooks `stripe` et `cinetpay` ; en dev sans clés API,
`initiatePurchase()` l'appelle directement.
