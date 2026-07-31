# Lot 2 — Litiges & chargebacks : Spécification d'implémentation

> **État réel au disque** : vérifié le 31 juillet 2026.
> La majorité du Lot 2 a été PERDUE lors d'un nettoyage du `/tmp`.

---

## 1. Ce qui existe RÉELLEMENT

### 1.1 Schéma Prisma

Le schéma `prisma/schema.prisma` contient bien les modèles du Lot 2 :
- `Dispute` (avec `createdAt`/`updatedAt`, `overrideJustification`, `refundStatus`)
- `DisputeMessage` (avec `attachments String[]`)
- `FundReservation` (avec `reservedAmountFcfa`, `debitedAmount`, `releasedAmount`)
- `DisputeReviewEvent`
- `ConsumptionSnapshot`
- `CourseView` (avec `watchedSeconds`, `downloaded`)
- `ManualRefundTask`
- `SupportTicket`
- Enums : `DisputeSource`, `DisputeReason`, `DisputeStatus`, `DisputeResolution`, `DisputeMessageAuthorRole`, `FundReservationStatus`

### 1.2 Service métier

| Fichier | État |
|---|---|
| `src/lib/disputes.ts` | ❌ **MANQUANT** — perdu, jamais recréé |

Ce fichier contenait ~650 lignes : `openDispute`, `postDisputeMessage`, `askLearner`, `resolveDispute`, `processRefund`, `releaseFundReservation`, `autoCloseDisputes`, `listDisputes`, `getDisputeStats`.

### 1.3 Routes API

| Route | État |
|---|---|
| `/api/me/disputes` (GET, POST) | ❌ **MANQUANTE** |
| `/api/me/disputes/[disputeId]` (GET) | ❌ **MANQUANTE** |
| `/api/me/disputes/[disputeId]/messages` (POST) | ❌ **MANQUANTE** |
| `/api/me/disputes/attachments/upload` (POST) | ❌ **MANQUANTE** |
| `/api/admin/disputes` (GET) | ❌ **MANQUANTE** |
| `/api/admin/disputes/stats` (GET) | ❌ **MANQUANTE** |
| `/api/admin/disputes/[disputeId]` (GET) | ❌ **MANQUANTE** |
| `/api/admin/disputes/[disputeId]/messages` (POST) | ❌ **MANQUANTE** |
| `/api/admin/disputes/[disputeId]/ask-learner` (POST) | ❌ **MANQUANTE** |
| `/api/admin/disputes/[disputeId]/resolve` (POST) | ❌ **MANQUANTE** |
| `/api/admin/manual-refund-tasks` (GET) | ❌ **MANQUANTE** |
| `/api/admin/manual-refund-tasks/[taskId]/complete` (POST) | ❌ **MANQUANTE** |
| `/api/admin/manual-refund-tasks/[taskId]/cancel` (POST) | ❌ **MANQUANTE** |
| `/api/trainer/disputes` (GET) | ❌ **MANQUANTE** |
| `/api/trainer/disputes/[disputeId]/contest` (POST) | ❌ **MANQUANTE** |

**Total : 14 routes manquantes.**

### 1.4 Webhooks (Lot 0, mais utilisés par Lot 2)

| Route | État |
|---|---|
| `/api/webhooks/stripe` | ❌ **MANQUANTE** — le handler avec `charge.dispute.created/closed` a été perdu |
| `/api/webhooks/cinetpay` | ❌ **MANQUANTE** — le handler avec vérification API check a été perdu |

### 1.5 Jobs planifiés

| Fichier | État |
|---|---|
| `src/lib/jobs-lot2.ts` | ❌ **MANQUANT** |
| `src/instrumentation.ts` | ❌ **MANQUANT** — les jobs ne sont pas démarrés |

### 1.6 Tests

| Fichier | État |
|---|---|
| `tests/lot2-invariants.test.ts` | ❌ **MANQUANT** — 7 tests perdus |

---

## 2. Ce qui a été testé et validé avant la perte

7 tests automatisés passaient :
1. T1 : ouverture litige → FundReservation ACTIVE + accessSuspended
2. T7 : REJECT → FundReservation RELEASED + accessSuspended rétabli
3. T6 : FULL_REFUND → FundReservation DEBITED + wallet débité + Purchase.refundedAt
4. T8 : auto-timeout → RESOLVED_AUTO + accès rétabli
5. Crédit wallet idempotent : 2 appels → 1 seul crédit
6. Règle 14j : litige refusé après 14 jours
7. Règle 30% : litige refusé si vidéo consultée à 30%+

---

## 3. Spécification de recréation

### 3.1 Machines à états (à réimplémenter)

#### Dispute

| # | Transition | Acteur | Condition | Effet de bord |
|---|---|---|---|---|
| T1 | `∅ → OPEN` | Apprenant / webhook / admin | LEARNER_REQUEST : achat <14j, vérif consommation, pas de litige actif. STRIPE_CHARGEBACK : si `Purchase.refundedAt` non null → contester Stripe, ne pas créer de Dispute. | Création Dispute + ConsumptionSnapshot ; `Purchase.accessSuspended = true` ; FundReservation ACTIVE (`reservedBalance += reservedAmountFcfa` où = 85% × disputedAmountFcfa) ; email formateur + lien contestation ; notif MODERATION |
| T2 | `OPEN → IN_REVIEW` | Support (1er message) | — | `readByLearner = false` |
| T3 | `IN_REVIEW → WAITING_LEARNER` | Support (`/ask-learner`) | `expectedUpdatedAt` | `learnerDeadlineAt = now + 7j` ; message SYSTEM ; email apprenant |
| T4 | `WAITING_LEARNER → IN_REVIEW` | Apprenant (message) | — | `learnerDeadlineAt = null` ; `readBySupport = false` |
| T5 | `IN_REVIEW → WAITING_LEARNER` | Support (question supp.) | `expectedUpdatedAt` | Idem T3 |
| T6 | `→ RESOLVED_REFUNDED` | Support (`/resolve` FULL/PARTIAL) | `expectedUpdatedAt`. FULL sans override : 14j + 30%. FULL avec override : Super-admin. Refund provider tenté. | `resolution` ; `refundStatus = PENDING`. FundReservation reste ACTIVE. `accessSuspended` reste true. À COMPLETED : FundReservation → DEBITED/PARTIALLY_DEBITED ; `reservedBalance -= reservedAmountFcfa` ; `balance -= debitedAmount` ; `Purchase.refundedAt = now` |
| T7 | `→ RESOLVED_REJECTED` | Support (`/resolve` REJECT) | `expectedUpdatedAt` | `refundStatus = NOT_APPLICABLE` ; FundReservation → RELEASED ; `reservedBalance -= reservedAmountFcfa` ; `Purchase.accessSuspended = false` |
| T8 | `WAITING_LEARNER → RESOLVED_AUTO` | Job (timeout) | `learnerDeadlineAt < NOW()` | `resolution = AUTO_TIMEOUT` ; FundReservation → RELEASED ; `accessSuspended = false` |
| T9 | `→ RESOLVED_REFUNDED` | Webhook Stripe (loss) | `Purchase.refundedAt IS NULL` | Idem T6 mais `resolvedById = null` |
| T10 | `→ RESOLVED_REJECTED` | Webhook Stripe (won) | — | Idem T7 mais `resolvedById = null` |

#### FundReservation

| # | Transition | Condition | Effet de bord |
|---|---|---|---|
| FR1 | `∅ → ACTIVE` | Dispute T1 | `reservedBalance += reservedAmountFcfa` |
| FR2 | `ACTIVE → RELEASED` | REJECT / AUTO_TIMEOUT | `reservedBalance -= reservedAmountFcfa` ; `balance` non affecté |
| FR3 | `ACTIVE → DEBITED` | FULL_REFUND + `refundStatus = COMPLETED` | `reservedBalance -= reservedAmountFcfa` ; `balance -= reservedAmountFcfa` |
| FR4 | `ACTIVE → PARTIALLY_DEBITED` | PARTIAL_REFUND + `refundStatus = COMPLETED` | `debitedAmount = 85% × refundAmountFcfa` ; `releasedAmount = reservedAmountFcfa - debitedAmount` ; `reservedBalance -= reservedAmountFcfa` ; `balance -= debitedAmount` |
| FR5 | `ACTIVE → RELEASED` | ManualRefundTask CANCELLED | `reservedBalance -= reservedAmountFcfa` ; `balance` non affecté |

### 3.2 Règle de remboursement (14j + consommation, corrigée par décision 14)

- **14 jours** : `Purchase.createdAt >= NOW() - 14 jours`
- **Consommation** :
  - Format streamé (vidéo) : `CourseView.watchedSeconds / Course.durationSeconds < 0.30`
  - Format téléchargeable : si `CourseView.downloaded = true` → 403 `RESOURCE_DOWNLOADED`
  - Abonnement communauté : prorata période < 30%
- **`policyOverride`** : Super-admin uniquement, bypass 14j/30%

### 3.3 Prévention du double débit (décision 17)

- Webhook `charge.dispute.created` : si `Purchase.refundedAt` non null → `stripe.disputes.submitEvidence()` + `DOUBLE_DEBIT_PREVENTED`
- Si admin tente refund alors que `Purchase.providerDisputeActive = true` → 409

### 3.4 Suspension d'accès (décision 18)

- `accessSuspended` vit sur `Purchase` (pas sur Dispute)
- T1 : `accessSuspended = true`
- REFUND : reste `true`
- REJECT / AUTO : `accessSuspended = false`

### 3.5 Visibilité du motif (décision 19)

- `reasonDetail` visible par apprenant + Modération, **JAMAIS** par formateur
- Formateur voit uniquement `reason` (enum) + `courseTitle`

### 3.6 Constantes

```typescript
export const LEARNER_RESPONSE_DEADLINE_DAYS = 7;
export const PLATFORM_COMMISSION_RATE = 0.15;
export const TRAINER_SHARE_RATE = 0.85;
export const WALLET_NEGATIVE_ALERT_DAYS = 60;
export const CINETPAY_REFUND_TIMEOUT_SECONDS = 30;
export const DISPUTE_MESSAGE_MAX_LENGTH = 5000;
```

### 3.7 Jobs à recréer

1. Auto-timeout des litiges WAITING_LEARNER — horaire
2. Cohérence wallet reservedBalance + pendingPayoutBalance — quotidien 03:30 UTC
3. Alerte wallet négatif > 60 jours — quotidien 03:30 UTC

### 3.8 Dépendance Lot 4

Le Lot 2 dépend du Lot 4 pour `CourseView` :
- `watchedSeconds` alimenté par `access.ts → updateWatchProgress()`
- `downloaded` alimenté par `access.ts → markCourseDownloaded()`
- Le `ConsumptionSnapshot` fige ces valeurs à l'ouverture du litige
