# Lot 1 — Validation des formateurs : Spécification d'implémentation

> **État réel au disque** : vérifié le 31 juillet 2026, **recréé le 1er août 2026**
> sur la branche `claude/lot-2-continuation-f46e0d`.
> Les sections 1.2 à 1.6 décrivent l'état d'origine (tout manquant) ; la
> section 4 décrit ce qui a été recréé.

---

## 1. Ce qui existait avant la recréation

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

---

## 4. État après recréation (1er août 2026)

### 4.1 Fichiers créés

| Fichier | Contenu |
|---|---|
| `src/lib/trainer-applications.ts` | T1-T8, listing, stats, détail |
| `src/lib/trainer-documents.ts` | D0-D7, presign, confirm (magic number), URL signée, purge 90 j |
| `src/lib/pending-attachments.ts` | Nettoyage des pièces jointes non consommées |
| `tests/lot1-invariants.test.ts` | 13 tests métier (les 7 attendus + purge, reprise d'upload, stats) |
| `tests/lot1-routes.test.ts` | 6 tests HTTP (RBAC, décision 7, concurrence) |
| `tests/auth-session.test.ts` | 5 tests de révocation de session (voir §4.3) |

Les 13 routes de §1.3 existent toutes. Les 2 jobs sont câblés dans
`src/lib/jobs.ts` (03:00 et 04:00 UTC), qui en compte désormais 5.

### 4.2 Choix faits là où la spec était muette

- **Approbation groupée des pièces** — la spec ne prévoit pas de route
  d'approbation pièce par pièce (D2 dit seulement « si tous APPROVED →
  `/approve` possible »). `/approve` passe donc toutes les pièces courantes en
  APPROVED puis approuve le dossier, dans la même transaction.
- **Rejet partiel** — seules les pièces listées passent REJECTED ; les autres
  restent PENDING et n'ont pas à être renvoyées.
- **Purge (D7)** — `s3Key` et `sha256` ne sont pas nullables au schéma : ils
  sont vidés (`''`) plutôt que la ligne supprimée, pour conserver la trace de la
  décision. L'objet R2 part avant le marquage, donc un échec de suppression fait
  simplement réessayer le job au passage suivant.
- **Reprise d'un upload abandonné** — une pièce restée AWAITING_UPLOAD peut être
  re-présignée sans consommer de compteur de re-soumission (voir §4.3).

### 4.3 Deux défauts trouvés par le test réel

- **Un upload abandonné bloquait définitivement le type de pièce.** Un presign
  jamais confirmé (échec réseau, abandon) laissait une pièce AWAITING_UPLOAD
  `isCurrent`, et toute nouvelle demande renvoyait `DOCUMENT_ALREADY_SUBMITTED`
  — sans aucun moyen de s'en sortir. La reprise est désormais distinguée de la
  re-soumission : même `resubmissionCount`, quel que soit le statut du dossier.
- **La révocation de session ne fonctionnait pas** (`src/lib/auth.ts`, Lot 0).
  NextAuth v4 réémet le JWT à chaque requête, donc `token.iat` vaut toujours
  « maintenant » et la comparaison `iat < sessionsValidAfter` n'était jamais
  vraie : le bump exigé par T2/T3/T6/T8 était inerte. Une date d'ouverture de
  session (`token.issuedAt`) est maintenant figée à la connexion, et le contrôle
  s'exécute après le rafraîchissement périodique. Latence résiduelle assumée :
  jusqu'à 5 minutes (compromis JWT documenté), couverte par `tests/auth-session.test.ts`.

### 4.4 Vérifié de bout en bout (1er août 2026)

Parcours curl complet contre le serveur de dev, avec R2 réellement configuré —
c'est-à-dire le parcours de §2, rejoué :

1. Register → 201, rôle LEARNER
2. `POST /api/trainer-applications` (T1) → DRAFT, rôle inchangé
3. Submit sans pièces → 422 `DOCUMENTS_INCOMPLETE`
4. Presign + **PUT réel sur R2** + confirm pour les 3 types → 200
5. Faux PDF téléversé (R2 accepte, HTTP 200) → confirm **422
   `MAGIC_NUMBER_MISMATCH`** : le contrôle de contenu fait son travail
6. Submit (T2) → SUBMITTED, `role = PENDING_TRAINER` en base
7. Login Modération, file → 1 dossier, stats `pending = 1`
8. Approve (T3) → APPROVED, `TrainerProfile` + `Wallet` créés,
   `role = TRAINER`, 3 pièces APPROVED
9. Invariant vérifié en SQL : exactement 1 pièce `isCurrent` par (dossier, type)

L'email d'approbation a été refusé par Resend (adresse `example.com` interdite)
— et **l'approbation a réussi quand même**, grâce à `deliverSideEffects`. C'est
la validation en conditions réelles de cette résilience.

Les 7 objets déposés sur R2 pendant ce test ont été supprimés du bucket.

### 4.5 Écarts restants

- Aucune page frontend (`devenir-formateur`, `candidature/statut`,
  `admin/validation-formateurs`) — §1.4, non demandées.
- Décision 10 : la liste blanche MIME des cours (`courses.ts`) ne couvre
  toujours pas zip/xlsx/docx, et le quota par plan SaaS n'existe pas. Hors
  périmètre du Lot 1 (ce sont les uploads de ressources, pas de candidature).
