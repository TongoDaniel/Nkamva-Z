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
| `tests/lot4-invariants.test.ts` | ✅ Présent | **11 tests, tous verts** contre PostgreSQL réel (+ webhook rejoué, payload malformé, double achat concurrent) |

Les 8 tests d'origine couvrent :
1. catalogue : recherche + filtre + pagination
2. achat Stripe complet : initiation → crédit wallet idempotent
3. achat CinetPay complet : initiation → crédit wallet
4. webhook reçu deux fois → wallet crédité une seule fois
5. accès refusé si Purchase.accessSuspended
6. CourseView : watchedSeconds alimenté pour le streamé (video)
7. CourseView : downloaded = true pour le téléchargeable (pdf)
8. CourseView : pas de téléchargement pour le streamé (video)

### 1.4 Frontend

> ⚠️ Tableau périmé — voir §5. Toutes ces pages existent depuis le 2 août 2026.

| Page | État |
|---|---|
| Landing | ✅ |
| Catalogue · fiche ressource | ✅ |
| Tunnel d'achat · confirmation | ✅ |
| Mes ressources · lecteur | ✅ |
| Mes achats | ✅ |
| Espace formateur : publication, upload, archivage | ✅ |

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
  video:   { mimes: ['video/mp4'], maxSize: 2_147_483_648 },        // 2 Go
  pdf:     { mimes: ['application/pdf'], maxSize: 10_485_760 },       // 10 Mo
  image:   { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxSize: 5_242_880 }, // 5 Mo
  archive: { mimes: ['application/zip', 'application/x-zip-compressed',
                     'application/vnd.rar', 'application/x-rar-compressed'],
             maxSize: 2_147_483_648 },                              // 2 Go
};
```

`archive` a été ajouté le 8 août 2026 : `kit`, `notion` et `tableur` — trois des
cinq formats du tableau §3, tous téléchargeables — n'avaient aucun type de
fichier acceptable, et `publishCourse` exigeant un contenu, ils étaient
impubliables. Les quatre types MIME couvrent les deux orthographes que les
navigateurs emploient sur Windows.

Le contenu d'une archive **n'est pas inspecté** : `confirmCourseUpload` saute le
contrôle de signature pour ce genre-là, l'extension fait foi. Une archive
authentique peut renfermer n'importe quoi — le contrôle établissait « c'est bien
un zip », jamais « c'est sain » — et un fichier illisible se constate à l'usage,
par la voie des litiges. Les autres genres le gardent : une image ou un PDF sont
*rendus* par le navigateur, pas seulement téléchargés. Le fichier vide, lui,
reste refusé partout.

---

## 5. Mobile money : opérateurs, pays et devise (8 août 2026)

**La liste d'opérateurs est une donnée du fournisseur, pas une constante du
produit.** `src/lib/pawapay.ts` portait une table écrite à la main croisant une
marque générique (`MTN_MOMO`, `M_PESA`) avec un pays. Sept de ses entrées
désignaient des opérateurs **inexistants** — `ORANGE_BFA`, `ORANGE_MLI`,
`AIRTEL_KEN`, `AIRTEL_NGA`, `AIRTEL_UGA`, `AIRTEL_ZMB` (le vrai code est
`AIRTEL_OAPI_ZMB`) et `MPESA_LSO` — et elle ne pouvait pas exprimer HaloPesa,
TNM, Moov, Free, Tigo ni Zamtel. Elle est supprimée : tout se résout désormais
sur `/v2/active-conf`, qui dit ce que **ce compte marchand** distribue.

L'apprenant choisit un **code opérateur** (`MTN_MOMO_CMR`, `HALOTEL_TZA`), qui
porte déjà son pays. La liste affichée est celle de son pays, filtrée par les
devises dont le taux est administré : elle ne peut donc pas mener à une impasse.

**La devise suit le pays.** `PAWAPAY_CURRENCY = 'XAF'` était figé : hors zone
franc, la capacité de l'opérateur était cherchée dans une devise qu'il n'annonce
pas, et les bornes de montant comparaient des francs CFA à des shillings. La
conversion vit dans `src/lib/fx.ts` :

- **XAF et XOF sont à parité fixe** (1:1 depuis 1945) — aucun taux à administrer ;
- les autres devises exigent une ligne dans `fx_rates` (`unitsPerXaf`) ;
- **aucun repli** : sans taux, l'achat est refusé (`FX_RATE_MISSING`). Un pays
  fermé vaut mieux qu'un pays ouvert à un taux inventé ;
- aucun appel externe dans le chemin critique du paiement.

**Un remboursement rend ce qui a été prélevé**, pas ce que le taux du jour
dirait : `refundAmountFromDeposit` lit le dépôt chez PawaPay et lui applique la
proportion remboursée. Piège vérifié au bac à sable — PawaPay *rend* `"500.00"`
pour un dépôt de 500 XAF mais *refuse* un remboursement à décimales sur cette
devise : les décimales se lisent sur l'opérateur, jamais sur la forme du montant
reçu.

**Wave est retiré.** Il n'est pas distribué par PawaPay : un moyen de versement
Wave partait systématiquement en traitement manuel sans que le formateur le
sache. La migration `20260808130000_drop_wave_operator` archive les moyens
concernés au lieu de les supprimer — ils portent des pièces et un historique.

**Reste transitoire :** `PayoutMethod.mobileOperator` stocke encore une marque
générique. `providerForOperator()` fait le pont en **filtrant** les codes que le
compte distribue — il n'en fabrique aucun — mais un formateur ne peut toujours
pas enregistrer un compte HaloPesa ou TNM. La colonne doit passer au code
opérateur.

---

## 6. Audit du 4 août 2026

Les §1.3, §1.4, §5 et §6 de la version précédente décrivaient un Lot 4 qui « ne
peut pas tourner », faute d'auth, de health check et de front. **Tout cela
existe** : le socle est complet (voir `lot0-socle.md`), les 11 tests tournent
contre PostgreSQL réel, et les écrans du parcours cœur sont en place — landing,
catalogue, fiche ressource, tunnel d'achat, mes ressources, mes achats, plus
l'espace formateur de publication.

Vérifié sur le disque : les limites d'upload du §4 aux valeurs exactes, le
crédit wallet idempotent du §2, `CourseView` alimenté par `/progress` et
`/download` comme décrit au §3. Les charges utiles des écrans correspondent
toutes à leur schéma Zod — la classe de bug trouvée au Lot 2 ne touche pas ce
lot.

### 5.1 Un double achat était possible, et il a été reproduit

`initiatePurchase` contrôlait l'achat existant par une lecture, puis insérait —
sans transaction ni contrainte en base. Deux requêtes simultanées lisaient
toutes deux « aucun achat » et créaient chacune la leur.

Ce n'est pas resté théorique : une sonde lançant deux achats concurrents du même
cours **a produit deux achats dans 2 exécutions sur 6**, avec un portefeuille
formateur crédité de 25 500 FCFA au lieu de 12 750. L'idempotence de
`creditWalletOnPurchase` ne rattrape rien ici : elle porte sur
`providerTransactionId`, et chaque achat a le sien.

Conséquence côté apprenant : un double clic sur « payer », ou un renvoi de
formulaire, pouvait le faire payer deux fois la même ressource.

**Correctif** — index unique partiel `purchases_active_course_unique` sur
`("learnerId", "courseId")` filtré sur `providerStatus IN ('PENDING',
'SUCCEEDED')`, migration `20260804000000`. Le filtre reprend exactement celui du
contrôle applicatif : l'index ne change aucun comportement, il le rend
infalsifiable. `initiatePurchase` intercepte la violation (`P2002`) et renvoie
l'achat du gagnant, plutôt qu'une erreur à un apprenant qui n'a rien fait de
mal. Vérifié : 8 exécutions sur 8 propres après correctif, contre 4 sur 6 avant.

Même procédé que `community_subscriptions_active_unique` — Prisma ne sait pas
exprimer un index unique partiel dans le schéma, il vit en SQL brut.

### 5.2 La fiche formateur publique n'existait pas

`/formateurs` listait bien **4 formateurs réels** via `listPublicTrainers`, mais
`/formateurs/[trainerId]` lisait `TRAINERS` dans les données de démonstration et
appelait `notFound()` sur tout identifiant inconnu. Conséquence : **les quatre
profils réels renvoyaient 404**, et l'annuaire ne liait même pas vers eux — les
cartes n'avaient aucun lien. Le seul chemin qui menait à cette page était le lien
« Animée par » d'une page communauté, elle-même en démonstration.

La page est rebranchée sur `getPublicTrainer()`, qui applique **les mêmes
conditions de visibilité que l'annuaire** — approuvé, non suspendu, au moins une
ressource publiée — sans quoi une fiche resterait atteignable par son URL après
avoir disparu de la liste. `generateStaticParams` a été retiré : il pré-générait
les pages depuis les identifiants de démonstration.

Deux ajustements de rendu par rapport à la maquette :
- la note n'apparaît que si `ratingCount > 0` — « 0,0 ★ » sur une fiche neuve
  dessert un formateur qui n'a pas encore d'avis ;
- le panneau « Communauté » ne s'affiche que si le formateur en anime une
  réellement (`Community.status = 'active'`), là où la maquette en montrait une
  pour tout le monde.

⚠️ **Effet de bord assumé** : `/communautes/[slug]` sert encore de la
démonstration et liait « Animée par » vers `/formateurs/<id fictif>`, qui tombe
désormais en 404. Le nom n'est plus cliquable sur cette page, en attendant que
les communautés soient rebranchées à leur tour.

---

## 7. Fonctionnalités de l'inventaire encore non couvertes

*Recalé le 4 août 2026 : la moitié de ce tableau était périmée.*

| # | Fonctionnalité | Statut |
|---|---|---|
| Landing page | ✅ |
| Catalogue · fiche ressource (front) | ✅ |
| Tunnel d'achat (front) | ✅ |
| Mes ressources · mes achats (front) | ✅ |
| Annuaire formateurs · fiche formateur | ✅ (voir §5.2) |
| Catalogue/fiche communautés | ⚠️ Écrans ✅, **données de démonstration** — le modèle `Community` existe pourtant en base |
| Tarifs (3 offres, FAQ) | ✅ |
| Pages légales et support | ✅ |
| Inscription/connexion/OTP (front) | ✅ |
| Tableau de bord apprenant | ✅ (`/accueil`) |
| Favoris | ✅ |
| Profil apprenant (RGPD) | ✅ (export et suppression) |
| Recherche transversale | ❌ — la recherche est par section, pas globale |
| Onboarding apprenant | Hors périmètre (décision 6) |
| Invitations communauté magic link | ❌ — spécifié le 5 août 2026 (`docs/invitations.md`, arbitrages 71-86) |
| Facture PDF | ❌ |
| Communautés apprenant | ⚠️ Écrans publics ✅, espace membre ❌ |
| Lives (LiveKit) | ⚠️ Écrans de démonstration, aucun LiveKit branché |
| Messagerie 1-1 | ⚠️ Écran de démonstration, aucun modèle en base |
| Certificats/évaluations | Hors périmètre (décision 4) |
| Profil apprenant (RGPD) | ❌ |
| Tableau de bord formateur | ❌ |
| Revenus formateur (analytics) | ❌ |
| Abonnement SaaS formateur | ❌ |
| Communauté formateur (posts) | ❌ |
| Invitations communauté formateur | ❌ — spécifié le 5 août 2026 (`docs/invitations.md`, arbitrages 71-86) |
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
