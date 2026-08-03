# Lot 2 — Litiges & chargebacks : Spécification d'implémentation

> **État réel au disque** : vérifié le 31 juillet 2026, **recréé le 1er août 2026**
> sur la branche `claude/lot-2-continuation-f46e0d`.
> La majorité du Lot 2 avait été PERDUE lors d'un nettoyage du `/tmp` ; les
> sections 1.2 à 1.6 ci-dessous décrivent l'état d'origine (tout manquant), la
> section 4 décrit ce qui a été recréé.

---

## 1. Ce qui existait avant la recréation

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

---

## 4. État après recréation (1er août 2026)

### 4.1 Fichiers créés

| Fichier | Contenu |
|---|---|
| `src/lib/disputes.ts` | T1-T10, FR1-FR5, snapshot de consommation, pièces jointes, lectures |
| `src/lib/manual-refund-tasks.ts` | File Finances : listing, complete (FR3/FR4), cancel (FR5) |
| `src/lib/wallet-reconciliation.ts` | Cohérence `reservedBalance` / `pendingPayoutBalance`, alerte négatif 60 j |
| `src/lib/jobs.ts` | 3 jobs `node-cron` (auto-timeout horaire, réconciliation et alerte 03:30 UTC) |
| `src/instrumentation.ts` | Démarrage des jobs (désactivé en test et via `DISABLE_SCHEDULED_JOBS=1`) |
| `src/lib/stripe.ts` | Client Stripe mémoïsé partagé webhooks / refunds / contestation |
| `tests/lot2-invariants.test.ts` | 12 tests métier (les 7 attendus + prorata partiel, double débit, T9/T10, visibilité formateur, résilience email) |
| `tests/lot2-routes.test.ts` | 9 tests HTTP (RBAC par sous-rôle, validation, concurrence, mapping d'erreurs) |
| `tests/env-hermetic.test.ts` | Garde-fou : aucune clé de service réelle active pendant les tests |

Les 15 routes listées en §1.3 existent toutes. Le webhook
`/api/webhooks/stripe` gère désormais `charge.dispute.created` (T1 chargeback ou
contestation anti-double-débit) et `charge.dispute.closed` (T9 / T10).

`src/lib/api.ts` gagne `errorFromException()` (mapping mutualisé des erreurs
métier) et `parsePagination()`. Les limites `DISPUTE_OPEN`, `DISPUTE_MESSAGE` et
`UPLOAD_PRESIGN` de `rate-limit.ts` sont branchées sur les routes apprenant.

### 4.2 Choix faits là où la spec était muette ou contradictoire

- **§3.2 vs décision 14** — la vérification de consommation est appliquée à
  **l'ouverture** (conformément à T1 et aux tests 6 et 7) : `RESOURCE_CONSUMED`
  (422) pour un format streamé consulté à ≥ 30 %, `RESOURCE_DOWNLOADED` (403)
  pour un format téléchargeable déjà téléchargé. La règle est re-vérifiée à la
  résolution pour un `FULL_REFUND` sans `policyOverride`.
- **FR5 (annulation d'une tâche de remboursement manuel)** — la spec ne
  mentionne que l'effet wallet. Comme aucun argent n'a bougé, l'accès de
  l'apprenant est **rétabli** et `Purchase.refundAmountFcfa` remis à null, en
  plus de la libération de la réservation.
- **`negativeSince`** — recalculé à chaque mouvement de solde déclenché par un
  litige (`syncNegativeSince`), ce qui referme l'écart signalé dans
  `decisions-nkamva.md` (« `completeRefund` ne recalcule pas `negativeSince` »).
- **Décision 16** — le formateur est notifié **à la résolution** aussi, pas
  seulement à l'ouverture (écart signalé comme partiel dans les décisions).
- **Abonnement communauté** — `ConsumptionSnapshot.courseId` n'étant pas
  nullable, l'identifiant de la communauté y est stocké, discriminé par
  `courseFormat = 'community'`.
- **Montant d'un chargeback** — `charge.dispute.created.amount` est exprimé dans
  la devise de la charge et n'est donc **pas** repris comme montant FCFA ; le
  litige porte sur `Purchase.amountFcfa`.

### 4.3 Robustesse

- **Effets de bord post-commit non bloquants** — notifications et emails partent
  après le commit et sont encapsulés dans `deliverSideEffects()`. Une panne
  Resend ne peut plus faire échouer une transition déjà persistée (sinon
  l'appelant recevait un 500 alors que le litige existait, et son retry tombait
  sur `DISPUTE_ALREADY_ACTIVE`). Les échecs sont journalisés en
  `NOTIFICATION_DELIVERY_FAILED`.
- **Liens d'email absolus** — construits via `WEB_BASE_URL` (`absoluteUrl()`) :
  un href relatif est mort dans un client mail. Les liens des notifications
  in-app restent relatifs, le routeur front les résout.

### 4.4 Vérifié de bout en bout (1er août 2026)

- `bun run test` : **32/32** contre un PostgreSQL réel (base `nkamva_test`).
- `next build` : compile, les 15 routes Lot 2 sont enregistrées.
- Smoke test sur services réels (base `nkamva`, Resend actif) : T1 puis T7,
  réservation 12 750 FCFA posée puis libérée, accès suspendu puis rétabli,
  0 échec de livraison. Les deux emails formateur ont été **délivrés** et leur
  contenu vérifié : motif enum + titre uniquement, **aucun `reasonDetail`**
  (décision 19 validée sur l'email réellement envoyé), liens absolus.

### 4.4ter Audit du 3 août 2026 — la console d'arbitrage ne tenait pas ses contrats

Toute la spécification §3 est vérifiée sur le disque : les 8 constantes aux
valeurs exactes, les 3 jobs (auto-timeout horaire, réconciliation et alerte à
03:30 UTC), les décisions 17, 18 et 19, les 15 routes plus la résolution de
ticket de contestation. Les 7 pages du Lot 2 existent — `/mes-litiges` et son
détail, `/formateur/litiges` et son détail, `/admin/litiges` et son détail,
`/admin/remboursements` — alors que §4.5 les annonçait absentes.

**Trois contrats cassés entre la console et ses routes**, tous corrigés. Même
cause : un champ `.optional()` dont la clé est mal nommée passe la validation
Zod en silence, et **aucun test ne traversait la frontière interface → route**.

1. **Le motif de chaque résolution était jeté.** La console envoyait `note`, la
   route attendait `resolutionNote`. Le modérateur rédigeait sa justification —
   l'interface en exigeait dix caractères — et le litige était enregistré avec
   `resolutionNote: null`, sans que personne ne puisse s'en apercevoir.
2. **La dérogation hors barème était impossible depuis la console.** Le drapeau
   `policyOverride` n'était jamais transmis : seul `overrideJustification`
   partait. Sans le drapeau, le service repassait par le contrôle 14 j / 30 % et
   répondait `REFUND_RULE_NOT_MET`. Un Super-admin remplissant le formulaire
   prévu pour lui se faisait refuser — c'est-à-dire précisément le cas d'un
   chargeback opérateur.
3. **Finances ne pouvait pas enregistrer un échec de remboursement.**
   `/admin/remboursements` envoyait `errorMessage`, la route exige `reason`
   (obligatoire, 10 caractères) ; le bouton s'activait dès 5 caractères. FR5
   était donc inatteignable et **les fonds du formateur restaient gelés**. La
   fenêtre annonçait en plus l'inverse du comportement réel (« l'accès de
   l'apprenant reste suspendu » alors qu'il est rétabli, cf. §4.2).

**Arbitrage tranché** : `resolutionNote` devient **obligatoire** (10 à 2 000
caractères) sur `/resolve`, au même titre que sur la résolution de ticket. Une
décision qui débite un formateur ou clôt la demande d'un apprenant, et qui leur
est notifiée, doit dire pourquoi — sans quoi la contestation qui suit s'instruit
à l'aveugle. Le champ étant désormais requis, une clé mal nommée produit un 400
visible au lieu d'une perte silencieuse.

Trois tests de route ajoutés à `lot2-routes.test.ts` : persistance du motif,
parcours complet de la dérogation par un Super-admin, et annulation d'une tâche
de remboursement manuel par Finances.

### 4.4bis Deux défauts trouvés le 3 août 2026

Trouvés en repointant `tests/dispute-review.test.ts` sur le service vivant —
voir §4.5, premier point. Les deux sont corrigés dans `disputes.ts`.

- **La fenêtre de 14 jours se mesurait jusqu'à l'instant de la décision, pas
  jusqu'à l'ouverture du litige.** `resolveDispute` comparait
  `purchase.createdAt` à `now - 14 j` : un apprenant ayant contesté au 12e jour
  se voyait refuser son remboursement dès que l'instruction dépassait le 14e —
  le délai de traitement de la modération devenait sa faute, alors que son droit
  était acquis à l'ouverture (et déjà contrôlé par `openDispute`). La comparaison
  porte désormais sur `dispute.openedAt` contre `purchase.createdAt + 14 j`.
- **Un `PARTIAL_REFUND` égal au montant contesté était accepté**, et comme le
  contrôle 14 j / 30 % ne s'applique qu'à `FULL_REFUND`, il ouvrait un
  remboursement intégral hors barème sans dérogation, sans Super-admin et sans
  justification. Le montant partiel doit maintenant être **strictement
  inférieur** au montant contesté.

### 4.5 Écarts restants

- **Seconde implémentation supprimée.** `dispute-review.ts` réimplémentait
  `postSupportMessage`, `askLearner`, `resolveDispute`, `releaseReservations`,
  `completeRefund` et les tâches manuelles, sans qu'aucune route ne les appelle :
  la console admin écrit via `/api/admin/disputes/*`, donc via `disputes.ts` et
  `manual-refund-tasks.ts`. Le fichier est réduit à ses **modèles de lecture**
  (`listDisputes`, `getDisputeStats`, `getDisputeForReview`,
  `listManualRefundTasks`), seuls utilisés par les pages. Ses 21 tests ont été
  repointés sur le chemin vivant plutôt que supprimés — c'est ce repointage qui
  a révélé les deux défauts du §4.4bis. Les codes d'erreur des deux
  implémentations divergeaient aussi (`PARTIAL_AMOUNT_INVALID` vs
  `INVALID_REFUND_AMOUNT`, `POLICY_OVERRIDE_FORBIDDEN` vs `OVERRIDE_FORBIDDEN`,
  `DISPUTE_CLOSED` vs `DISPUTE_ALREADY_RESOLVED`).
- ~~Point non tranché : le motif de résolution est optionnel~~ — **tranché le
  3 août**, voir §4.4ter : `resolutionNote` est obligatoire.
- Aucune page frontend Lot 2 — **faux depuis le 2 août**, les 7 écrans existent
  (voir §4.4ter).
- ~~`/api/auth/[...nextauth]/route.ts` n'existe pas~~ — **faux** : la route
  existe, ainsi que `src/types/next-auth.d.ts`. Les tests de route continuent
  d'utiliser une session simulée, par choix : c'est `requireAdminSubRole` qu'ils
  exercent, pas le mécanisme de cookie.

- **Décision 15** — le chemin « tentative → repli » existe désormais pour les
  deux providers : `stripe.refunds.create` (clé d'idempotence
  `refund_{disputeId}`) et `attemptCinetPayRefund` (timeout 30 s, référence =
  `disputeId`, aucun retry silencieux). ⚠️ CinetPay ne documentant pas
  publiquement d'endpoint de remboursement stable, l'URL est surchargeable par
  `CINETPAY_REFUND_URL` et **reste à valider** contre l'API réelle ; sans clés,
  la fonction retourne `CINETPAY_NOT_CONFIGURED` sans émettre d'appel.
- En dev sans `STRIPE_SECRET_KEY`, le refund Stripe est réputé accepté — même
  convention que la simulation de paiement de `purchases.ts`.
- Aucune page frontend Lot 2 (non demandée, et non listée dans cette spec).
- ~~Hors Lot 2, bloquant : `/api/auth/[...nextauth]` n'existe pas~~ — **levé**,
  voir le point correspondant plus haut. `tsc --noEmit` est vert.
