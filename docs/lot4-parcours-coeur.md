# Lot 4 — Parcours cœur : Spécification d'implémentation

> **État réel au disque** : vérifié le 31 juillet 2026.
> Le Lot 4 est le seul lot **entièrement présent** sur le disque (jamais perdu).

---

## 1. Ce qui existe RÉELLEMENT

### 1.1 Services (`src/lib/`)

| Fichier | Taille | État | Contenu |
|---|---|---|---|
| `catalog.ts` | 3 282 B | ✅ | `searchCourses` (recherche full-text, filtres category/format/level/prix, tri, pagination), `getPublicCourse(slug)`, `getCategories()`, `getFormats()` |
| `courses.ts` | 6 318 B | ✅ | `createCourse` (slug auto, prix min 500 FCFA), `updateCourse`, `publishCourse`, `archiveCourse`, `listTrainerCourses`, `presignCourseUpload` (R2, limites par type) |
| `purchases.ts` | 5 373 B | ✅ | `initiatePurchase` (Stripe/CinetPay, crédit wallet idempotent en dev), `reconcilePurchase`, `listMyPurchases` |
| `access.ts` | 6 830 B | ✅ | `checkCourseAccess` (accessSuspended), `getCourseContentUrl`, `updateWatchProgress` (CourseView.watchedSeconds), `markCourseDownloaded` (CourseView.downloaded), `listMyResources`, `getConsumptionPercent` |

### 1.2 Routes API (15 routes, toutes présentes)

| Route | Méthode | État |
|---|---|---|
| `/api/catalog/courses` | GET | ✅ |
| `/api/courses/[slug]` | GET | ✅ |
| `/api/me/purchases` | GET | ✅ |
| `/api/me/resources` | GET | ✅ |
| `/api/me/resources/[courseId]/content` | GET | ✅ |
| `/api/me/resources/[courseId]/download` | POST | ✅ |
| `/api/me/resources/[courseId]/progress` | POST | ✅ |
| `/api/purchases/initiate` | POST | ✅ |
| `/api/purchases/[purchaseId]/reconcile` | GET | ✅ |
| `/api/trainer/courses` | GET, POST | ✅ |
| `/api/trainer/courses/[courseId]` | GET, PATCH | ✅ |
| `/api/trainer/courses/[courseId]/upload` | POST | ✅ |
| `/api/trainer/courses/[courseId]/publish` | POST | ✅ |
| `/api/trainer/courses/[courseId]/archive` | POST | ✅ |

### 1.3 Tests

| Fichier | État | Tests |
|---|---|---|
| `tests/lot4-invariants.test.ts` | ✅ Présent | 8 tests — **ne peuvent pas tourner** car les services Lot 0 (auth/register/health) nécessaires au setup sont manquants |

Les 8 tests couvrent :
1. catalogue : recherche + filtre + pagination
2. achat Stripe complet : initiation → crédit wallet idempotent
3. achat CinetPay complet : initiation → crédit wallet
4. webhook reçu deux fois → wallet crédité une seule fois
5. accès refusé si Purchase.accessSuspended
6. CourseView : watchedSeconds alimenté pour le streamé (video)
7. CourseView : downloaded = true pour le téléchargeable (pdf)
8. CourseView : pas de téléchargement pour le streamé (video)

### 1.4 Frontend

| Page | État |
|---|---|
| Landing | ❌ Page template initial (logo Z.ai, pas NkamVa) |
| Catalogue | ❌ Non implémenté |
| Fiche ressource | ❌ Non implémenté |
| Tunnel d'achat | ❌ Non implémenté |
| Mes ressources | ❌ Non implémenté |
| Mes achats | ❌ Non implémenté |

---

## 2. Crédit wallet idempotent (déclenchement réel)

Le crédit wallet du Lot 0 (`creditWalletOnPurchase` dans `src/lib/wallet.ts`) se déclenche réellement dans le Lot 4 :

1. **À l'initiation** (`initiatePurchase` dans `purchases.ts`) : en dev (sans `STRIPE_SECRET_KEY` ou `CINETPAY_API_KEY`), appelle `creditWalletOnPurchase` immédiatement.
2. **Au webhook** (routes `/api/webhooks/*` — **MANQUANTES**) : en production, le webhook appellerait `creditWalletOnPurchase`.

**Idempotence garantie par** :
- `Purchase.providerTransactionId @unique`
- `updateMany WHERE providerStatus = PENDING` (la transition n'a lieu qu'une fois)
- `upsert` du wallet en filet

---

## 3. CourseView et règle de remboursement

`CourseView` est alimenté par le Lot 4 et consommé par le Lot 2 :

| Format | Signal CourseView | Règle 30% (Lot 2) |
|---|---|---|
| video (streamé) | `watchedSeconds` via POST `/progress` | `watchedSeconds / durationSeconds >= 30%` → litige refusé |
| pdf, kit, notion, tableur (téléchargeable) | `downloaded = true` via POST `/download` | Si `downloaded` → consommation = 100%, remboursement auto indisponible |

Le `ConsumptionSnapshot` (Lot 2 — service `disputes.ts` manquant) figerait la consommation à l'ouverture du litige en lisant `CourseView`.

---

## 4. Limites d'upload cours

```typescript
export const COURSE_UPLOAD_LIMITS = {
  video: { mimes: ['video/mp4'], maxSize: 2_147_483_648 },        // 2 Go
  pdf:   { mimes: ['application/pdf'], maxSize: 10_485_760 },       // 10 Mo
  image: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxSize: 5_242_880 }, // 5 Mo
};
```

---

## 5. Dépendances critiques manquantes pour le fonctionnement

Le Lot 4 est entièrement codé mais **ne peut pas tourner** car les éléments suivants du Lot 0 sont manquants :

| Élément manquant | Impact sur Lot 4 |
|---|---|
| `/api/auth/register` | Impossible de créer un apprenant pour tester un achat |
| `/api/auth/[...nextauth]` | Impossible de se connecter |
| `/api/health` | Pas de health check |
| `.env` pointe vers SQLite, pas PostgreSQL | `db:push` échoue (schéma PostgreSQL vs provider SQLite) |
| `src/instrumentation.ts` | Jobs non démarrés |
| `src/types/next-auth.d.ts` | Types Session/JWT incomplets |
| `layout.tsx` utilise `Toaster` au lieu de `sonner` | Toasts ne fonctionnent pas correctement |
| `page.tsx` est le template initial | Pas de page de validation |

---

## 6. Fonctionnalités de l'inventaire encore non couvertes

| # | Fonctionnalité | Statut |
|---|---|---|
| Landing page | ❌ Front template initial |
| Catalogue (front) | ❌ Backend ✅, front ❌ |
| Fiche ressource (front) | ❌ Backend ✅, front ❌ |
| Tunnel d'achat (front) | ❌ Backend ✅, front ❌ |
| Mes ressources (front) | ❌ Backend ✅, front ❌ |
| Mes achats (front) | ❌ Backend ✅, front ❌ |
| Annuaire formateurs | ❌ |
| Catalogue/fiche communautés | ❌ |
| Recherche transversale | ❌ |
| Tarifs (3 offres, FAQ) | ❌ |
| Pages légales et support | ❌ |
| Onboarding apprenant | Hors périmètre (décision 6) |
| Inscription/connexion/OTP (front) | ❌ Backend manquant aussi |
| Invitations communauté magic link | ❌ |
| Tableau de bord apprenant | ❌ |
| Facture PDF | ❌ |
| Favoris | ❌ |
| Communautés apprenant | ❌ |
| Lives (LiveKit) | ❌ |
| Messagerie 1-1 | ❌ |
| Certificats/évaluations | Hors périmètre (décision 4) |
| Profil apprenant (RGPD) | ❌ |
| Tableau de bord formateur | ❌ |
| Revenus formateur (analytics) | ❌ |
| Abonnement SaaS formateur | ❌ |
| Communauté formateur (posts) | ❌ |
| Invitations communauté formateur | ❌ |
| Membres & apprenants | ❌ |
| Lives formateur | ❌ |
| Replays | ❌ |
| Analytics formateur | ❌ |
| Tableau de bord admin | ❌ |
| Finance admin (transactions, abonnements, rapports) | ❌ |
| Modération admin (signalements, ressources, interactions) | ❌ |
| Utilisateurs admin | ❌ |
| Équipe admin | ❌ |
| Système admin | ❌ |
| Configuration admin | ❌ |
| Communication admin | ❌ |
| Audit admin | ❌ |
| Analytics admin | ❌ |
| Tracking provenance ventes | ❌ |
