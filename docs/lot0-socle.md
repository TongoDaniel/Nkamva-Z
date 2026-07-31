# Lot 0 — SOCLE : Spécification d'implémentation

> **État réel au disque** : vérifié le 31 juillet 2026.
> Ce document reflète exactement ce qui existe sur le disque, pas ce qui était prévu.

---

## 1. Ce qui existe RÉELLEMENT sur le disque

### 1.1 Configuration

| Fichier | État | Contenu réel |
|---|---|---|
| `.env` | ⚠️ **SQLite, pas PostgreSQL** | `DATABASE_URL=file:/home/z/my-project/db/custom.db` |
| `package.json` | ✅ Complet | Toutes les dépendances installées (voir §3) |
| `prisma/schema.prisma` | ✅ PostgreSQL, 830 lignes | Schéma complet Lots 0-4, provider `postgresql` |
| `vitest.config.ts` | ✅ Présent | Alias `@/` via `import.meta.url` |
| `eslint.config.mjs` | ⚠️ Partiel | `ignores` ne contient pas `audit/**` — les fichiers de la maquette peuvent causer des erreurs de lint |
| `src/instrumentation.ts` | ❌ **MANQUANT** | Les jobs planifiés ne sont pas démarrés |
| `src/types/next-auth.d.ts` | ❌ **MANQUANT** | L'augmentation de types Session/JWT n'existe pas |

### 1.2 Constat critique : .env vs schema.prisma

Le `.env` pointe vers **SQLite** (`file:/home/z/my-project/db/custom.db`) mais le `schema.prisma` déclare **PostgreSQL** (`provider = "postgresql"`). PostgreSQL n'est **pas installé** et ne tourne pas sur la machine. La base SQLite `db/custom.db` contient l'ancien schéma template (User + Post), pas le schéma NkamVa.

**Conséquence** : `bun run db:push` échouera car Prisma ne peut pas pousser un schéma PostgreSQL sur SQLite. Pour que le projet fonctionne, il faut soit :
- (a) Installer PostgreSQL et corriger `.env`, soit
- (b) Remettre le `schema.prisma` sur SQLite (avec les contournements : `String?` au lieu de `String[]`, `Float` au lieu de `Decimal`, pas d'index unique partiel).

### 1.3 Base de données

La base `db/custom.db` (24 Ko) contient uniquement les tables `User` et `Post` du template initial. Le schéma NkamVa complet n'a jamais été poussé sur cette base.

---

## 2. Services socles (`src/lib/`)

### 2.1 Services existants et fiables

| Fichier | Taille | État | Notes |
|---|---|---|---|
| `db.ts` | 387 B | ✅ | Singleton PrismaClient avec `dotenv` explicite |
| `types.ts` | 137 B | ✅ | Type `PrismaTransaction` |
| `audit.ts` | 1 021 B | ✅ | `audit(tx, params)` transactionnel + `auditStandalone(params)` |
| `api.ts` | 3 964 B | ✅ | Enveloppe `{ data, meta }`, erreurs, RBAC, `parseBody`, `isPublicRoute(method, path)` |
| `auth.ts` | 3 019 B | ✅ | NextAuth v4 avec Credentials, callbacks jwt/session, `sessionsValidAfter` |
| `password.ts` | 435 B | ✅ | argon2id via `@node-rs/argon2` |
| `rate-limit.ts` | 1 857 B | ✅ | In-memory avec purge périodique, 9 limites prédéfinies |
| `s3.ts` | 3 894 B | ✅ | R2 présigné, `validateMagicNumber` (5 formats), `headObject`, `getRange`, `deleteObject` |
| `wallet.ts` | 2 307 B | ✅ | `creditWalletOnPurchase` idempotent (updateMany + upsert + audit) |

### 2.2 Services existants mais simplifiés

| Fichier | Taille | État | Ce qui manque vs spec originale |
|---|---|---|---|
| `email.ts` | 967 B | ⚠️ Simplifié | `sendEmail()` fonctionne, mais `renderSimpleEmail()` (helper template HTML) a été supprimé lors de la recréation |
| `notification.ts` | 808 B | ⚠️ Simplifié | `notify()` et `notifyAdminSubRole()` fonctionnent, mais `markNotificationsRead()` a été supprimé |

### 2.3 Services MANQUANTS (perdus, jamais recréés)

| Fichier | Lot | Contenu perdu |
|---|---|---|
| `trainer-applications.ts` | Lot 1 | T1-T8, D0-D7, re-soumission atomique, listing, stats (~650 lignes) |
| `disputes.ts` | Lot 2 | T1-T10, FR1-FR5, openDispute, resolveDispute, autoClose (~650 lignes) |
| `kyc-payouts.ts` | Lot 3 | computeKycScore, PayoutMethod CRUD, Payout P1-P8 (~550 lignes) |
| `jobs-lot1.ts` | Lot 1 | Purge 90j, PendingAttachment |
| `jobs-lot2.ts` | Lot 2 | Auto-timeout, cohérence wallet, alerte 60j |
| `jobs-lot3.ts` | Lot 3 | Carence 72h, SLA 48h |

### 2.4 Services Lot 4 (existants, jamais perdus)

| Fichier | Taille | État |
|---|---|---|
| `catalog.ts` | 3 282 B | ✅ Recherche, filtres, tri, pagination |
| `courses.ts` | 6 318 B | ✅ CRUD formateur, upload R2, publication |
| `purchases.ts` | 5 373 B | ✅ Initiation Stripe/CinetPay, crédit wallet |
| `access.ts` | 6 830 B | ✅ Accès contenu, CourseView, accessSuspended |

---

## 3. Routes API existantes

### 3.1 Routes présentes sur le disque (15 routes)

| Route | Méthode | Lot | État |
|---|---|---|---|
| `/api/route.ts` | GET | Template | ⚠️ "Hello world" du template initial |
| `/api/catalog/courses` | GET | Lot 4 | ✅ |
| `/api/courses/[slug]` | GET | Lot 4 | ✅ |
| `/api/me/purchases` | GET | Lot 4 | ✅ |
| `/api/me/resources` | GET | Lot 4 | ✅ |
| `/api/me/resources/[courseId]/content` | GET | Lot 4 | ✅ |
| `/api/me/resources/[courseId]/download` | POST | Lot 4 | ✅ |
| `/api/me/resources/[courseId]/progress` | POST | Lot 4 | ✅ |
| `/api/purchases/initiate` | POST | Lot 4 | ✅ |
| `/api/purchases/[purchaseId]/reconcile` | GET | Lot 4 | ✅ |
| `/api/trainer/courses` | GET, POST | Lot 4 | ✅ |
| `/api/trainer/courses/[courseId]` | GET, PATCH | Lot 4 | ✅ |
| `/api/trainer/courses/[courseId]/upload` | POST | Lot 4 | ✅ |
| `/api/trainer/courses/[courseId]/publish` | POST | Lot 4 | ✅ |
| `/api/trainer/courses/[courseId]/archive` | POST | Lot 4 | ✅ |

### 3.2 Routes MANQUANTES (perdues, jamais recréées)

| Lot | Routes manquantes | Nombre |
|---|---|---|
| Lot 0 | `/api/auth/[...nextauth]`, `/api/auth/register`, `/api/health`, `/api/webhooks/stripe`, `/api/webhooks/cinetpay` | 5 |
| Lot 1 | `/api/trainer-applications/*` (5 routes), `/api/admin/trainer-applications/*` (8 routes) | 13 |
| Lot 2 | `/api/me/disputes/*` (3 routes), `/api/admin/disputes/*` (6 routes), `/api/admin/manual-refund-tasks/*` (3 routes), `/api/trainer/disputes/*` (2 routes) | 14 |
| Lot 3 | `/api/trainer/kyc-score`, `/api/trainer/payout-methods/*` (3 routes), `/api/trainer/payouts/*` (2 routes), `/api/admin/payout-methods/*` (6 routes), `/api/admin/payouts/*` (5 routes), `/api/admin/wallets/*` (2 routes) | 19 |
| **Total manquant** | | **51 routes** |

---

## 4. Pages frontend

| Page | État | Contenu réel |
|---|---|---|
| `src/app/page.tsx` | ⚠️ **Template initial** | 30 lignes — logo Z.ai centré, pas la page de validation NkamVa |
| `src/app/layout.tsx` | ⚠️ **Template initial** | Utilise `Toaster` de `@/components/ui/toaster` (pas `sonner`). Metadata "Z.ai Code Scaffold" |
| `src/app/devenir-formateur/page.tsx` | ❌ **MANQUANT** | Wizard 4 étapes perdu |
| `src/app/candidature/statut/page.tsx` | ❌ **MANQUANT** | Page statut perdue |
| `src/app/admin/validation-formateurs/page.tsx` | ❌ **MANQUANT** | Page admin perdue |

### 4.1 Composants shadcn/ui

48 composants présents dans `src/components/ui/` (template initial, jamais modifiés). Tous les composants nécessaires sont disponibles : `button`, `card`, `dialog`, `input`, `textarea`, `label`, `checkbox`, `tabs`, `table`, `badge`, `avatar`, `select`, `sonner`, etc.

### 4.2 Hooks

`use-mobile.ts` et `use-toast.ts` — template initial, jamais modifiés.

---

## 5. Tests

| Fichier | État | Contenu |
|---|---|---|
| `tests/setup.ts` | ✅ Présent | PrismaClient + `cleanDatabase()` via TRUNCATE CASCADE |
| `tests/lot4-invariants.test.ts` | ✅ Présent | 8 tests (catalogue, achat Stripe/CinetPay, webhook double, accessSuspended, CourseView) |
| `tests/lot0-invariants.test.ts` | ❌ **MANQUANT** | 6 tests perdus |
| `tests/lot1-invariants.test.ts` | ❌ **MANQUANT** | 7 tests perdus |
| `tests/lot2-invariants.test.ts` | ❌ **MANQUANT** | 7 tests perdus |
| `tests/lot3-invariants.test.ts` | ❌ **MANQUANT** | 10 tests perdus |

---

## 6. Schéma Prisma

Le fichier `prisma/schema.prisma` (830 lignes) contient **tous les modèles des Lots 0-4** :
- 22 enums
- 28 modèles (User, TrainerProfile, Course, Purchase, Community, CommunitySubscription, Wallet, WalletReconciliation, PayoutMethod, Payout, PayoutMethodReviewEvent, PayoutReviewEvent, AuditLog, Notification, Setting, EmailOtp, PendingAttachment, TrainerApplication, TrainerDocument, TrainerApplicationReviewEvent, TrainerDocumentReviewEvent, Dispute, DisputeMessage, FundReservation, DisputeReviewEvent, ConsumptionSnapshot, CourseView, ManualRefundTask, SupportTicket)
- Provider : `postgresql` (mais `.env` pointe vers SQLite — incohérence)

---

## 7. Dépendances installées (`package.json`)

### Dépendances NkamVa (ajoutées pendant la session)

```
@aws-sdk/client-s3        ✅ Installé
@aws-sdk/s3-request-presigner ✅ Installé
@node-rs/argon2           ✅ Installé
dotenv                    ✅ Installé
next-auth                 ✅ Installé (v4.24.11)
node-cron                 ✅ Installé
resend                    ✅ Installé
sonner                    ✅ Installé
vitest                    ✅ Installé (devDep)
zod                       ✅ Installé
```

### Dépendances non installées

```
stripe                    ❌ Non installé (mentionné dans les specs mais jamais ajouté)
file-type                 ❌ Non installé (validation magic number — actuellement implémenté manuellement dans s3.ts)
```

### Dépendances template (pré-existantes)

Next.js 16, React 19, Prisma 6, @tanstack/react-query 5, zustand 5, react-hook-form 7, framer-motion 12, recharts 2.15, sharp 0.34, lucide-react, 48 composants shadcn/ui, next-intl 4 (installé mais non utilisé — décision : pas d'i18n), next-themes, date-fns, uuid, etc.

---

## 8. Conventions transverses (telles qu'implémentées)

| Convention | Spec | Réel | Écart |
|---|---|---|---|
| Type d'ID | UUID v4 | UUID v4 (`@default(uuid())`) | ✅ Conforme |
| Préfixe routes | `/api` | `/api` | ✅ Conforme |
| Enveloppe réponse | `{ data, meta }` | `{ data, ...(meta ? { meta } : {}) }` | ✅ Conforme |
| Erreurs | `{ error: { code, message } }` | Conforme | ✅ Conforme |
| 422 pour règles métier | Oui | Oui | ✅ Conforme |
| Pagination | page + pageSize (max 50) | Conforme | ✅ Conforme |
| Toast | `sonner` | `Toaster` de shadcn (pas sonner) | ⚠️ **layout.tsx utilise `@/components/ui/toaster` au lieu de `sonner`** |
| Polling (pas WebSocket) | TanStack Query 8s/15s | Non implémenté côté front | ❌ Front manquant |
| i18n | Aucun (FR en dur) | `next-intl` installé mais non utilisé | ✅ Conforme (non utilisé) |
| Hachage | argon2id | argon2id via `@node-rs/argon2` | ✅ Conforme |
| Auth | NextAuth v4 | NextAuth v4 | ✅ Conforme |
| Stockage | Cloudflare R2 | R2 (mais pas de credentials configurés) | ✅ Conforme (mode dev factice) |
| Email | Resend | Resend (mais pas de clé API) | ✅ Conforme (mode dev console) |
| Jobs | node-cron in-process | node-cron installé mais `instrumentation.ts` manquant | ❌ **Jobs non démarrés** |

---

## 9. Matrice de permissions RBAC

La matrice est implémentée dans `src/lib/api.ts` via les fonctions :
- `requireAuth()` — session obligatoire, vérifie `suspendedAt` et `sessionsValidAfter`
- `requireRole(...roles)` — vérifie le rôle
- `requireAdminSubRole(...subRoles)` — vérifie le sous-rôle admin
- `requireTrainer()` — vérifie `trainerId` non null
- `isPublicRoute(method, path)` — routes publiques par (méthode, préfixe)

**Routes publiques définies** : `/api/auth/*`, `/api/catalog/*`, `/api/courses/*`, `/api/trainers`, `/api/communities`, `/api/tarifs`, `/api/legal/*`, `/api/contact`, `/api/aide`, `/api/webhooks/*`, `/api/health`.

---

## 10. Crédit wallet idempotent

Implémenté dans `src/lib/wallet.ts` — `creditWalletOnPurchase(tx, providerTransactionId, provider)` :
1. `updateMany WHERE providerStatus = PENDING` → si `count = 0`, déjà traité
2. `upsert` du wallet en filet
3. Audit `PURCHASE_SUCCEEDED` (+ `WALLET_AUTO_CREATED` si wallet créé)
4. Audit `WEBHOOK_DUPLICATE_IGNORED` si doublon

**Déclenchement réel** : dans `src/lib/purchases.ts` → `initiatePurchase()` appelle `creditWalletOnPurchase` en dev (sans clés API). En production, les webhooks (perdus) le déclencheraient.
