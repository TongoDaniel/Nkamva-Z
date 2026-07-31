# Lot 1 — Validation des formateurs : Spécification d'implémentation

> **État réel au disque** : vérifié le 31 juillet 2026.
> La majorité du Lot 1 a été PERDUE lors d'un nettoyage du `/tmp`.

---

## 1. Ce qui existe RÉELLEMENT

### 1.1 Schéma Prisma

Le schéma `prisma/schema.prisma` contient bien les modèles du Lot 1 :
- `TrainerApplication` (avec `createdAt`/`updatedAt`)
- `TrainerDocument` (avec `isCurrent`, `resubmissionCount`, `purgedAt`)
- `TrainerApplicationReviewEvent`
- `TrainerDocumentReviewEvent`
- Enums : `TrainerDocumentType`, `TrainerDocumentStatus`, `TrainerApplicationStatus`

### 1.2 Service métier

| Fichier | État |
|---|---|
| `src/lib/trainer-applications.ts` | ❌ **MANQUANT** — perdu, jamais recréé |

Ce fichier contenait ~650 lignes : `createApplication`, `getMyApplication`, `requestDocumentUpload`, `confirmDocumentUpload`, `submitApplication`, `approveApplication`, `rejectDocuments`, `rejectApplicationFinal`, `reopenApplication`, `listApplications`, `getApplicationStats`, `getApplicationDetail`.

### 1.3 Routes API

| Route | État |
|---|---|
| `/api/trainer-applications` (POST) | ❌ **MANQUANTE** |
| `/api/trainer-applications/me` (GET) | ❌ **MANQUANTE** |
| `/api/trainer-applications/me/documents/upload` (POST) | ❌ **MANQUANTE** |
| `/api/trainer-applications/me/documents/[documentId]/confirm` (POST) | ❌ **MANQUANTE** |
| `/api/trainer-applications/me/submit` (POST) | ❌ **MANQUANTE** |
| `/api/admin/trainer-applications` (GET) | ❌ **MANQUANTE** |
| `/api/admin/trainer-applications/stats` (GET) | ❌ **MANQUANTE** |
| `/api/admin/trainer-applications/[applicationId]` (GET) | ❌ **MANQUANTE** |
| `/api/admin/trainer-applications/[applicationId]/approve` (POST) | ❌ **MANQUANTE** |
| `/api/admin/trainer-applications/[applicationId]/reject-documents` (POST) | ❌ **MANQUANTE** |
| `/api/admin/trainer-applications/[applicationId]/reject-final` (POST) | ❌ **MANQUANTE** |
| `/api/admin/trainer-applications/[applicationId]/reopen` (POST) | ❌ **MANQUANTE** |
| `/api/admin/trainer-applications/[applicationId]/documents/[documentId]` (GET) | ❌ **MANQUANTE** |

**Total : 13 routes manquantes.**

### 1.4 Pages frontend

| Page | État |
|---|---|
| `src/app/devenir-formateur/page.tsx` | ❌ **MANQUANTE** — wizard 4 étapes perdu |
| `src/app/candidature/statut/page.tsx` | ❌ **MANQUANTE** — page statut perdue |
| `src/app/admin/validation-formateurs/page.tsx` | ❌ **MANQUANTE** — page admin perdue |

### 1.5 Jobs planifiés

| Fichier | État |
|---|---|
| `src/lib/jobs-lot1.ts` | ❌ **MANQUANT** |
| `src/instrumentation.ts` | ❌ **MANQUANT** — les jobs ne sont pas démarrés |

### 1.6 Tests

| Fichier | État |
|---|---|
| `tests/lot1-invariants.test.ts` | ❌ **MANQUANT** — 7 tests perdus |

---

## 2. Ce qui a été testé et validé avant la perte

Pendant la session, le flux complet a été testé en curl et validé :
1. Register (LEARNER) ✅
2. Create application (T1, DRAFT, rôle reste LEARNER) ✅
3. Upload 3 documents (ID_CARD, DIPLOMA, VIDEO) presign + confirm ✅
4. Submit (T2) → SUBMITTED, User.role → PENDING_TRAINER en base ✅
5. Admin login (MODERATION) ✅
6. Admin list pending → 1 candidature ✅
7. Admin stats → pending: 1 ✅
8. Approve (T3) → APPROVED, TrainerProfile créé avec verifiedLegalName, Wallet créé, User.role → TRAINER ✅

7 tests automatisés passaient :
1. T2 : bascule LEARNER → PENDING_TRAINER
2. T3 : crée TrainerProfile + Wallet + bascule TRAINER
3. T4 : rejet partiel → RESUBMISSION_PENDING
4. T6 : rejet définitif → User role revient à LEARNER
5. T8 : réouverture → User repasse PENDING_TRAINER
6. re-soumission atomique : isCurrent bascule
7. limite MAX_RESUBMISSIONS : 3 puis blocage

---

## 3. Spécification de recréation

### 3.1 Machines à états (à réimplémenter)

#### TrainerApplication

| # | Transition | Acteur | Condition | Effet de bord |
|---|---|---|---|---|
| T1 | `∅ → DRAFT` | Formateur | User authentifié, rôle ≠ TRAINER, aucune candidature non rejetée | Création ligne. Rôle reste LEARNER. |
| T2 | `DRAFT → SUBMITTED` | Formateur | 3 docs confirmés (PENDING/RESUBMITTED) | `submittedAt = now` ; **User.role → PENDING_TRAINER** ; `sessionsValidAfter` bumped ; notif tous admins MODERATION |
| T3 | `SUBMITTED → APPROVED` | Admin MODERATION | `expectedUpdatedAt` valide. `verifiedLegalName` saisi. | Transaction : création `TrainerProfile` + `Wallet` ; **User.role → TRAINER** ; purge planifiée 90j |
| T4 | `SUBMITTED → RESUBMISSION_PENDING` | Admin MODERATION | `expectedUpdatedAt` valide. Au moins 1 doc REJECTED. | `rejectionReason` par doc ; email formateur |
| T5 | `RESUBMISSION_PENDING → SUBMITTED` | Formateur | Toutes les pièces REJECTED re-soumises | Reset `reviewedAt` ; notif admins MODERATION |
| T6 | `RESUBMISSION_PENDING → REJECTED` | Admin MODERATION | Pièce à `resubmissionCount = MAX` ou motif grave | **User.role → LEARNER** ; `sessionsValidAfter` bumped ; purge planifiée |
| T7 | `SUBMITTED → REJECTED` | Admin MODERATION | Motif grave | Idem T6 |
| T8 | `REJECTED → RESUBMISSION_PENDING` | Super-admin | 4 conditions : status=REJECTED, reopenedById null, rejectedAt ≥ 24h, aucun doc purgé | **User.role → PENDING_TRAINER** ; `sessionsValidAfter` bumped |

#### TrainerDocument

| # | Transition | Acteur | Condition | Effet de bord |
|---|---|---|---|---|
| D0 | `∅ → AWAITING_UPLOAD` | Formateur | Presign valide. Re-soumission : transaction atomique (isCurrent=false sur l'ancienne) | Non visible côté admin |
| D1 | `AWAITING_UPLOAD → PENDING` | Formateur | `/confirm` : HeadObject + GetObject Range 0-4095 + file-type | Visible côté admin |
| D2 | `PENDING → APPROVED` | Admin MODERATION | Dossier SUBMITTED | Si tous APPROVED → `/approve` possible |
| D3 | `PENDING → REJECTED` | Admin MODERATION | `reject-documents` avec ce docId | dossier → RESUBMISSION_PENDING |
| D4 | `REJECTED → (archivé)` + nouvelle ligne | Formateur | Dossier RESUBMISSION_PENDING, `resubmissionCount < MAX` | Transaction atomique |
| D5-D6 | `RESUBMITTED → APPROVED/REJECTED` | Admin MODERATION | — | — |
| D7 | `* → purged` | Job | Dossier APPROVED/REJECTED depuis ≥ 90j | Suppression objet R2 + nullification |

### 3.2 Règles de sécurité

- **RBAC** : Modération uniquement pour les routes admin. Finances n'a **JAMAIS** accès aux pièces d'identité.
- **URLs signées R2** : TTL 5 min. Pas de proxy. Clé : `trainer-documents/{applicationId}/{type}-v{resubmissionCount}-{uuid}.{ext}`.
- **Journalisation** : `TRAINER_DOCUMENT_VIEW` uniquement à la redirection 302.
- **Conservation** : 90 jours après décision, puis purge R2 + nullification champs.
- **Limites par type** : ID_CARD/DIPLOMA → pdf/png/jpg/webp 10 Mo. VIDEO → mp4 2 Go.
- **Concurrence** : `expectedUpdatedAt` sur approve et reject-documents.

### 3.3 Constantes

```typescript
export const MAX_RESUBMISSIONS = 3;
export const SIGNED_URL_TTL_SECONDS = 300;
export const DOCUMENT_RETENTION_DAYS = 90;
export const REOPEN_MIN_DELAY_HOURS = 24;
```

### 3.4 Jobs à recréer

1. Purge des documents après 90 jours — quotidien 03:00 UTC
2. Nettoyage des PendingAttachment expirés — quotidien 04:00 UTC
