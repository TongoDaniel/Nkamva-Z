# Lot 3 — KYC, vérification RIB & payouts : Spécification d'implémentation

> **État réel au disque** : vérifié le 31 juillet 2026.
> La majorité du Lot 3 a été PERDUE lors d'un nettoyage du `/tmp`.

---

## 1. Ce qui existe RÉELLEMENT

### 1.1 Schéma Prisma

Le schéma `prisma/schema.prisma` contient bien les modèles du Lot 3 :
- `PayoutMethod` (avec `verifiedLegalNameAtCreation`, `carenceUntil`, `microDepositAmount1/2`, `isActive`)
- `Payout` (avec `kycScoreSnapshot`, `isFirstPayout`, `idempotencyKey`, `createdAt`/`updatedAt`)
- `PayoutMethodReviewEvent`
- `PayoutReviewEvent`
- `WalletReconciliation`
- Enums : `PayoutMethodType`, `AccountNature`, `MobileMoneyOperator`, `VerificationMethod`, `PayoutMethodVerificationStatus`, `PayoutStatus`

### 1.2 Service métier

| Fichier | État |
|---|---|
| `src/lib/kyc-payouts.ts` | ❌ **MANQUANT** — perdu, jamais recréé |

Ce fichier contenait ~550 lignes : `computeKycScore`, `createPayoutMethod`, `verifyPayoutMethod`, `rejectPayoutMethod`, `confirmMicroDeposit`, `createPayout`, `approvePayout`, `rejectPayout`, `markPayoutPaid`, `markPayoutFailed`, `reopenPayout`, `getPayoutStats`.

### 1.3 Routes API

| Route | État |
|---|---|
| `/api/trainer/kyc-score` (GET) | ❌ **MANQUANTE** |
| `/api/trainer/payout-methods` (GET, POST) | ❌ **MANQUANTE** |
| `/api/trainer/payout-methods/[id]/micro-deposit/confirm` (POST) | ❌ **MANQUANTE** |
| `/api/trainer/payouts` (GET, POST) | ❌ **MANQUANTE** |
| `/api/trainer/payouts/[id]` (GET) | ❌ **MANQUANTE** |
| `/api/admin/payout-methods` (GET) | ❌ **MANQUANTE** |
| `/api/admin/payout-methods/[id]` (GET) | ❌ **MANQUANTE** |
| `/api/admin/payout-methods/[id]/verify` (POST) | ❌ **MANQUANTE** |
| `/api/admin/payout-methods/[id]/reject` (POST) | ❌ **MANQUANTE** |
| `/api/admin/payout-methods/escalations` (GET) | ❌ **MANQUANTE** |
| `/api/admin/payout-methods/[id]/escalation-resolve` (POST) | ❌ **MANQUANTE** |
| `/api/admin/payouts` (GET) | ❌ **MANQUANTE** |
| `/api/admin/payouts/stats` (GET) | ❌ **MANQUANTE** |
| `/api/admin/payouts/[id]` (GET) | ❌ **MANQUANTE** |
| `/api/admin/payouts/[id]/approve` (POST) | ❌ **MANQUANTE** |
| `/api/admin/payouts/[id]/reject` (POST) | ❌ **MANQUANTE** |
| `/api/admin/payouts/[id]/mark-paid` (POST) | ❌ **MANQUANTE** |
| `/api/admin/wallets/[walletId]/reconcile-reserved-balance` (POST) | ❌ **MANQUANTE** |
| `/api/admin/wallets/[walletId]/reconcile-pending-payout-balance` (POST) | ❌ **MANQUANTE** |

**Total : 19 routes manquantes.**

### 1.4 Jobs planifiés

| Fichier | État |
|---|---|
| `src/lib/jobs-lot3.ts` | ❌ **MANQUANT** |
| `src/instrumentation.ts` | ❌ **MANQUANT** |

### 1.5 Tests

| Fichier | État |
|---|---|
| `tests/lot3-invariants.test.ts` | ❌ **MANQUANT** — 10 tests perdus |

### 1.6 Dépendance manquante

`stripe` SDK n'est **pas installé** dans `package.json`. Le Lot 3 nécessite `stripe` pour les virements via Stripe Connect.

---

## 2. Ce qui a été testé et validé avant la perte

10 tests automatisés passaient :
1. computeKycScore : score 0 sans rien, 50 avec PI + ancienneté, 100 avec RIB
2. computeKycScore : noOpenDispute = false si aucune vente SUCCEEDED
3. createPayoutMethod : carence 72h posée + archive l'ancien
4. createPayoutMethod : MOBILE_MONEY avec nom concordant → AUTO_VERIFIED
5. rejectPayoutMethod : 3 rejets → BLOCKED + User.payoutMethodRejectionCount
6. createPayout : pendingPayoutBalance incrémenté + premier retrait → IN_REVIEW
7. P6 : markPayoutPaid → pendingPayoutBalance ET balance décrémentés
8. P5 : rejectPayout → pendingPayoutBalance décrémenté, balance intact
9. carence bloquée : PayoutMethod en carence → createPayout échoue
10. solde retirable : reservedBalance + pendingPayoutBalance bloquent le retrait

---

## 3. Spécification de recréation

### 3.1 Score KYC (décision n°1)

```typescript
// Critère 1 : PI vérifiée (+40)
// TrainerDocument ID_CARD APPROVED + TrainerProfile.verifiedLegalName non null
const piVerified = !!idCard && !!profile.verifiedLegalName;

// Critère 2 : RIB vérifié hors carence (+30)
// PayoutMethod actif, VERIFIED, carenceUntil < NOW()
const ribVerified = !!activeMethod && (!activeMethod.carenceUntil || activeMethod.carenceUntil < now);

// Critère 3 : Ancienneté ≥ 30 jours (+10)
// TrainerProfile.approvedAt <= NOW() - 30j
const seniority30Days = !!profile.approvedAt && profile.approvedAt <= thirtyDaysAgo;

// Critère 4 : ≥ 3 ventes sans litige sur 90 jours (+10)
// Purchase SUCCEEDED, createdAt >= 90j, sans Dispute FULL_REFUND/PARTIAL_REFUND
const cleanSales3 = cleanSalesCount >= 3;

// Critère 5 : Aucun litige ouvert sur activité réelle (+10)
// 0 point si aucune vente SUCCEEDED
const noOpenDispute = totalCompletedSales > 0 && openDisputesCount === 0;

const score = (piVerified?40:0) + (ribVerified?30:0) + (seniority30Days?10:0)
            + (cleanSales3?10:0) + (noOpenDispute?10:0);

const badge = score >= 80 ? 'VERIFIED' : score >= 50 ? 'TO_VERIFY' : 'UNVERIFIED';
const payoutEligible = score >= 80 && !firstPayout && !carenceActive;
```

### 3.2 Machines à états

#### PayoutMethod

| # | Transition | Acteur | Condition | Effet de bord |
|---|---|---|---|---|
| PM1 | `∅ → PENDING_REVIEW/AUTO_VERIFIED` | Formateur | `payoutMethodRejectionCount < 3`, pas de Payout en cours, `verifiedLegalName` non null | Transaction : archive ancien + crée nouveau. `carenceUntil = now+72h`. MOBILE_MONEY → name lookup. |
| PM2 | `PENDING_REVIEW → MANUAL_VERIFIED` | Finances | Comparaison holderName vs `TrainerProfile.verifiedLegalName` (valeur vive) | `carenceUntil` inchangé |
| PM3 | `PENDING_REVIEW → PENDING_REVIEW` | Finances (MICRO_DEPOSIT) | IBAN | 2 micro-virements distincts (1-99 centimes, stockés en clair) |
| PM4 | `PENDING_REVIEW → MANUAL_VERIFIED` | Formateur (confirm) | 2 montants corrects | Sinon : `payoutMethodRejectionCount++` |
| PM5 | `MANUAL/AUTO_VERIFIED → VERIFIED` | Job (carence) | `carenceUntil < NOW()` | RIB vaut +30 au KYC |
| PM6 | `PENDING_REVIEW → REJECTED → BLOCKED` | Finances (reject) | — | `payoutMethodRejectionCount++`. Si ≥3 → BLOCKED + escalade |
| PM7 | `* → ARCHIVED` | Système (POST) | Pas de Payout en cours | Notif ancien email |
| PM8 | `BLOCKED → MANUAL_VERIFIED` | Super-admin (FORCE_VERIFY) | justification | `carenceUntil = now+72h` |
| PM9 | `BLOCKED → BLOCKED` | Super-admin (BLOCK) | justification | Définitif |
| PM10 | `ARCHIVED → ACTIVE` | Super-admin (RESTORE) | justification | `carenceUntil = now+72h`. Archive l'actuel. |

#### Payout

| # | Transition | Acteur | Condition | Effet de bord |
|---|---|---|---|---|
| P1 | `∅ → PENDING → AUTO_APPROVED/IN_REVIEW` | Formateur | amountFcfa ≥ 10000. ≤ retirable. Method VERIFIED, carence < NOW(). Pas de Payout en cours. | `pendingPayoutBalance += amountFcfa`. Snapshot KYC. Si score≥80 && !firstPayout → AUTO_APPROVED. Sinon IN_REVIEW. |
| P2 | `→ AUTO_APPROVED` | Système | score≥80, !firstPayout, !carenceActive | `wireInitiatedAt`, `idempotencyKey = "payout:{id}"`. Notif Finances. |
| P3 | `→ IN_REVIEW` | Système | firstPayout OU score<80 | — |
| P4 | `IN_REVIEW → APPROVED` | Finances | Re-vérif solde + KYC. `expectedUpdatedAt`. | `idempotencyKey`. Virement provider. |
| P5 | `IN_REVIEW → REJECTED` | Finances | `expectedUpdatedAt`, reason | `pendingPayoutBalance -= amountFcfa` |
| P6 | `→ PAID` | Webhook/Finances | Re-vérif solde + KYC | `pendingPayoutBalance -= amountFcfa` ET `balance -= amountFcfa` |
| P7 | `→ FAILED` | Webhook | Échec | `pendingPayoutBalance -= amountFcfa` |
| P8 | `FAILED → IN_REVIEW` | Finances | — | `pendingPayoutBalance += amountFcfa` |

### 3.3 RBAC

| Ressource | Formateur | MODERATION | FINANCES | SUPER_ADMIN |
|---|---|---|---|---|
| Score KYC | ✅ | ❌ | ❌ | ✅ |
| PayoutMethod (CRUD) | ✅ | ❌ | ❌ | ✅ |
| Image pièce d'identité | ❌ | ✅ (Lot 1) | **❌ JAMAIS** | ✅ |
| verifiedLegalName (valeur vive) | ✅ | ✅ | ✅ (lecture) | ✅ |
| Lister PayoutMethod | — | ❌ | ✅ | ✅ |
| Vérifier/Rejeter PayoutMethod | — | ❌ | ✅ | ✅ |
| Lister Payouts | — | ❌ | ✅ | ✅ |
| Escalades | — | ❌ | ❌ | ✅ |
| Réconcilier wallet | — | ❌ | ❌ | ✅ |

### 3.4 Constantes

```typescript
export const KYC_THRESHOLD_VERIFIED = 80;
export const KYC_THRESHOLD_TO_VERIFY = 50;
export const PAYOUT_METHOD_CARENCE_HOURS = 72;
export const PAYOUT_METHOD_MAX_REJECTIONS = 3;
export const PAYOUT_REVIEW_SLA_HOURS = 48;
export const PAYOUT_MIN_AMOUNT_FCFA = 10000;
export const CLEAN_SALES_WINDOW_DAYS = 90;
```

### 3.5 Jobs à recréer

1. Expiration carence 72h — horaire — PM5
2. Alerte SLA 48h — horaire

### 3.6 Dépendance à installer

```
stripe — SDK officiel pour Stripe Connect (virements, refunds)
```
