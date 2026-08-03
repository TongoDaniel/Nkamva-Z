# Lot 3 — KYC, vérification RIB & payouts : Spécification d'implémentation

> **État réel au disque** : vérifié le 31 juillet 2026, **recréé le 1er août 2026**
> sur la branche `claude/lot-2-continuation-f46e0d`.
> Les sections 1.2 à 1.6 décrivent l'état d'origine (tout manquant) ; la
> section 4 décrit ce qui a été recréé.

---

## 1. Ce qui existait avant la recréation

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

> Résolu : `stripe` v22.4.0 est installé et utilisé par `src/lib/stripe.ts`
> (webhooks paiement + chargebacks, refunds du Lot 2).

---

## 4. État après recréation (1er août 2026)

### 4.1 Fichiers créés

| Fichier | Contenu |
|---|---|
| `src/lib/kyc.ts` | `computeKycScore` : 5 critères pondérés, badges, éligibilité |
| `src/lib/payout-methods.ts` | PM1-PM10, name lookup, micro-virements, escalades, jobs carence/SLA |
| `src/lib/payout-methods.ts` | (idem) `expirePayoutMethodCarence`, `alertPayoutMethodSlaBreaches` |
| `src/lib/payouts.ts` | P1-P8, listings, stats, alerte SLA retraits |
| `src/lib/wallet-reconciliation.ts` | `reconcileWalletField` ajouté (correction Super-admin tracée) |
| `tests/lot3-invariants.test.ts` | 15 tests métier (les 10 attendus + P2, escalade, réconciliation) |
| `tests/lot3-routes.test.ts` | 8 tests HTTP (RBAC décision 20, décision 28, concurrence) |

Les 19 routes de §1.3 existent toutes. Les 2 jobs Lot 3 portent le total à **7**
(`PAYOUT_METHOD_CARENCE_EXPIRY` horaire, `PAYOUT_SLA_ALERT` horaire).

`syncNegativeSince` et `withdrawableBalance` ont été factorisés dans
`src/lib/wallet.ts` : les litiges (Lot 2) et les retraits (Lot 3) maintiennent
le même invariant `negativeSince ⟺ solde retirable < 0`.

### 4.2 Écarts de la version précédente qui ont été fermés

- **Décision 21** — le code d'erreur est bien `IDENTITY_NAME_MISSING` (409),
  comme l'exige l'arbitrage, et non `VERIFIED_LEGAL_NAME_REQUIRED`.
- **Décision 24** — la notification à l'**ancienne adresse email** est envoyée à
  chaque changement de moyen de paiement, avec un lien de signalement. C'était
  un écart constaté et non traité.
- **Décision 27** — `verificationMethod` est désormais positionné à `ESCALATION`
  quand le Super-admin tranche, et le compteur de rejets du formateur est remis
  à zéro sur un déblocage.
- **Décision 28** — les deux branches sont réellement distinctes :
  `INDIVIDUAL` exige le nom du titulaire ; `BUSINESS` exige la dénomination
  sociale, le document d'immatriculation ET la preuve de représentation légale.
  Il n'y avait auparavant aucune logique dédiée.
- **Décision 30** — le message de rejet reprend le motif et rappelle les deux
  options légitimes, sans jamais afficher le `verifiedLegalName` complet.

### 4.2bis Audit du 3 août 2026

Toute la spécification §3 est vérifiée sur le disque : le score KYC et ses cinq
critères avec leurs poids exacts, les seuils de badge et `payoutEligible`, les
machines PM1-PM10 et P1-P8, les 7 constantes, les 2 jobs (carence à `15 * * * *`,
SLA à `45 * * * *`), le RBAC — `/api/trainer/kyc-score` est bien `requireTrainer`,
et la route de consultation ajoutée pour Finances restreint les types à
`BUSINESS_DOC` et `LEGAL_REP_PROOF`, jamais une pièce d'identité (décisions 7 et
21). Les charges utiles des consoles `/admin/moyens-de-paiement` et
`/admin/retraits` correspondent toutes à leur schéma Zod, seuils de saisie
compris — la classe de bug trouvée au Lot 2 ne s'est pas propagée ici.

**Un défaut trouvé et corrigé : P1 ne tenait pas en concurrence.** Le contrôle
du solde retirable et celui du retrait « en vol » se lisaient **hors
transaction**. Deux demandes simultanées lisaient la même valeur avant d'écrire
et repartaient toutes deux acceptées — vérifié : sur un solde de 50 000 FCFA,
deux demandes de 50 000 passaient et `pendingPayoutBalance` montait à 100 000.
En auto-approbation (décision 25) aucune revue Finances ne rattrape derrière, et
le portefeuille serait passé en négatif au versement.

L'immobilisation porte désormais sa propre condition de solde, en SQL, dans la
transaction : Postgres réévalue le `WHERE` après avoir verrouillé la ligne, donc
la seconde écriture ne trouve plus le solde et repart en 422. Couvert par un
test de concurrence réelle (`Promise.allSettled` sur deux demandes), qui échoue
bien sans le correctif — vérifié en le retirant.

> Résiduel assumé : deux retraits « en vol » simultanés restent possibles si le
> solde couvre les deux. Ce n'est plus une perte d'argent, seulement un écart à
> la règle « un seul retrait à la fois ». Le fermer proprement demande un index
> unique partiel sur `payouts(trainerId)` filtré sur les statuts en vol, donc une
> migration — même motif que `community_subscriptions_active_unique_index`.

**Constante SLA dédoublée.** `PAYOUT_REVIEW_SLA_HOURS = 48` existait dans
`payouts.ts` **et** dans `payout-methods.ts`. `/admin/moyens-de-paiement` lisait
l'une, `/admin/retraits` et `/admin/parametres` l'autre : changer le délai en
aurait laissé deux écrans sur trois sur l'ancienne valeur, dont celui qui
l'affiche comme la règle de la plateforme. Définition unique dans
`payout-methods.ts`, ré-exportée par `payouts.ts`.

### 4.3 Écarts maintenus (et pourquoi)

- **Décision 22a** — `lookupMobileMoneyName()` retourne toujours `UNAVAILABLE` :
  aucune API opérateur n'est disponible. `AUTO_VERIFIED` reste donc inatteignable,
  **y compris quand le nom déclaré est identique au nom légal** — un test le
  vérifie explicitement. Toute comparaison locale serait une vérification
  purement déclarative, ce que l'arbitrage interdit.
- **Décision 22c** — les micro-virements sont générés et stockés en clair, mais
  aucun virement bancaire réel n'est déclenché (provider bancaire non arbitré).
- **Décision 23** — le SLA de 48 h est calendaire, pas « ouvré » : aucun
  calendrier ouvré n'est modélisé.
- **Décision 24** — la notification à l'ancien **numéro de téléphone** n'est
  toujours pas envoyée : aucun provider SMS n'est configuré.
- ~~**Décisions 29 et 30** — relèvent du front, qui n'existe pas.~~ — **le front
  existe** depuis le 2 août : 2 écrans formateur (portefeuille, moyen de
  paiement) et 4 écrans admin (moyens de paiement et retraits, liste et détail).
  Le contenu pédagogique de ces deux décisions reste à écrire dans les écrans.

### 4.4 Vérifié

- `bun run test` : **79/79** contre PostgreSQL réel (l'ensemble des lots).
- `next build` : 65 routes API enregistrées.
- 7 jobs planifiés listés et démarrés au boot du serveur de dev.
- RBAC vérifié en HTTP réel : 401 sans session ; 403 `NOT_TRAINER` sur
  `/api/trainer/kyc-score` et 403 `FORBIDDEN_SUBROLE` sur les escalades pour un
  compte non habilité.
