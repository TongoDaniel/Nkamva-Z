# Décisions produit — NkamVa

> Ce document ne contient que des décisions **tranchées**. Les propositions de
> modélisation qui en découlent, non encore validées, vivent dans
> `docs/recommandations-modelisation.md` — ne pas confondre les deux autorités.
>
> Document de référence à re-coller en tête de chaque nouveau lot ou nouvelle session.
> Reconstitué depuis l'historique des arbitrages. En cas de divergence avec la version
> maintenue dans le repo, **c'est la version du repo qui fait foi**.
>
> **État de vérification** : chaque décision est annotée avec son statut d'implémentation
> réel au disque, vérifié le 31 juillet 2026 sur la branche
> `lein/prisma-schema-lot0-audit-ac819f` (services Lots 1-3 régénérés, webhooks Stripe/
> CinetPay réels, scheduler node-cron câblé — commits `0cf9b3e`, `12e0945`, `e563ae6`,
> `da640ca`, `710167b`, `8822fea`, `5dcc653`). Une version antérieure de cette note avait
> été rédigée contre un état plus ancien du dépôt (avant cette branche) et sous-estimait
> largement ce qui est réellement implémenté ; les statuts ci-dessous ont été recalés.
>
> Légende :
> - ✅ Implémenté et présent sur le disque
> - ⚠️ Partiellement implémenté ou écart temporaire assumé
> - ❌ Non implémenté (service/route manquant)
> - 📋 Spécifié mais aucun code — la décision est actée, l'implémentation reste à faire

---

## Arbitrages 1-11 — Socle produit (issus du Lot 1)

**1. Score KYC** — Score de 0 à 100 calculé, affiché en 3 badges.
PI vérifiée 40 · RIB vérifié 30 · Ancienneté ≥ 30 jours 10 ·
≥ 3 ventes réglées sans litige 10 · Aucun litige ouvert 10.
≥ 80 « Vérifié » · 50-79 « À vérifier » · < 50 « Non vérifié ».
Retrait auto-approuvable seulement si ≥ 80.
> Statut : ✅ `src/lib/kyc.ts` implémente `computeKycScore` avec les 5 critères pondérés
> (`KYC_WEIGHT_PI=40`, `KYC_WEIGHT_RIB=30`, `KYC_WEIGHT_SENIORITY=10`,
> `KYC_WEIGHT_CLEAN_SALES=10`, `KYC_WEIGHT_NO_OPEN_DISPUTE=10`) et les seuils
> `KYC_THRESHOLD_VERIFIED=80` / `KYC_THRESHOLD_TO_VERIFY=50`. `TRAINER_SHARE_RATE=0.85`
> vit dans `src/lib/disputes.ts`. Testé (`tests/lot3-invariants.test.ts`, 12 cas dont
> score 0/50/100 et le cas `noOpenDispute=false` sans vente).

**2. Remboursement** — Règle cumulative : ≤ 14 jours ET < 30 % consulté.
> ⚠️ **Corrigée par l'arbitrage 14.** La règle des 30 % ne s'applique qu'aux formats
> streamés. Voir 14 pour la règle en vigueur.
> Statut : ✅ `src/lib/disputes.ts` (`openDispute`) vérifie le délai de 14 jours contre
> `Purchase.createdAt` et la consommation via `computeConsumptionSnapshot`, qui lit
> `CourseView` (alimenté par `access.ts`). Testé : règle 14j et règle 30 % dans
> `tests/lot2-invariants.test.ts`.

**3. Parcours formateur** — Inscription légère → candidature (PI + diplôme + vidéo)
→ RIB collecté uniquement avant le premier retrait. L'étape RIB est retirée du wizard
d'inscription de la maquette.
Raison : minimisation RGPD + friction + le RIB n'est utile qu'au payout.
> Statut : ✅ `src/lib/trainer-applications.ts` + `src/lib/trainer-documents.ts`
> implémentent les machines à états T1-T8 / D0-D7 (Lot 1). Aucun champ RIB sur
> `TrainerApplication` dans le schéma (conforme). 13 routes API (`/api/trainer-applications/*`,
> `/api/admin/trainer-applications/*`) et 7 tests d'invariants
> (`tests/lot1-invariants.test.ts`).

**4. Mode école** — Hors périmètre. Flag désactivé, aucun écran à concevoir.
Ne pas modéliser Quiz/Certificate/Lesson.
> Statut : ✅ Conforme — aucun modèle Quiz/Certificate/Lesson dans le schéma Prisma.

**5. Boutons `.soon`** — Hors périmètre, sauf export RGPD, suppression de compte
et changement de mot de passe.
> Note du 3 août 2026 — **toutes les entrées de la navigation admin ont désormais leur
> page.** Les trois dernières (`/admin/signalements`, `/admin/analytics`,
> `/admin/parametres`) ont été livrées après arbitrage de ce qui les bloquait
> (arbitrages 63 à 66).
> Statut : 📋 Spécifié, inchangé. Les champs `gdprExportRequestedAt`, `gdprExportS3Key`,
> `deletionRequestedAt`, `deletedAt` existent sur `User` dans le schéma (✅).
> Aucune route API ne les exploite encore (hors périmètre des Lots 1-3 régénérés).

**6. Onboarding apprenant** — Hors périmètre.
Recherche transversale : pas d'écran dédié, intégrée au catalogue avec filtres par type.
> Statut : ✅ Conforme — `catalog.ts` implémente la recherche avec filtres
> (category, format, level, prix) ✅. Pas de page onboarding dédiée ✅.

**7. Permissions admin**
- Super-admin : tout, y compris équipe, configuration, audit.
- Finances : transactions, retraits, remboursements, abonnements, rapports.
  Lecture seule sur les utilisateurs. Aucun accès à la modération.
- Modération : signalements, modération des ressources, interactions, règles,
  validation des formateurs. Aucun accès aux finances.

Le journal d'audit est lisible par le Super-admin uniquement, mais toutes les actions
des 3 rôles y sont écrites.
> **Écran depuis le 3 août 2026** — `/admin/journal-audit`, réservé au Super-admin,
> filtrable par domaine et par objet (cliquer un identifiant remonte tout ce qui a
> touché le même objet). Il n'expose **aucune action de modification** : un journal
> qu'on peut retoucher ne prouve rien. La navigation admin est elle aussi filtrée par
> sous-rôle depuis cette date — auparavant Modération voyait « Transactions », cliquait,
> et se faisait rediriger sans explication.
> Écrans livrés le même jour : `/admin/transactions` et `/admin/utilisateurs`
> (Finances + Super-admin, Modération exclue), tous deux en **consultation seule**.
> Statut : ✅ `src/lib/api.ts` implémente `requireAdminSubRole(...subRoles)`, désormais
> utilisé par toutes les routes admin des Lots 1-3 : `MODERATION`+`SUPER_ADMIN` sur
> validation formateurs et litiges, `FINANCES`+`SUPER_ADMIN` sur payout-methods/payouts/
> manual-refund-tasks, `SUPER_ADMIN` seul sur reopen/escalation-resolve/réconciliation
> wallet. Le schéma définit `AdminRole { SUPER_ADMIN, FINANCES, MODERATION }` (✅).

**8. Litige vs payout** — À l'ouverture d'un litige, la part formateur de la vente
concernée passe en solde « réservé », exclue du montant retirable. Libération à la
résolution (rejet du litige) ou débit définitif (remboursement accordé).
> Statut : ✅ `src/lib/disputes.ts` implémente FR1-FR5 : `openDispute` crée la
> `FundReservation` ACTIVE et incrémente `Wallet.reservedBalance` (FR1) ; rejet/timeout
> la passe RELEASED (FR2) ; remboursement intégral/partiel la débite (FR3/FR4). Testé
> dans `tests/lot2-invariants.test.ts`.

**9. Community** — 1 formateur = 1 communauté dans cette version, mais modélisé en
1-to-many (`Community.trainerId`) avec contrainte applicative. Pas de contrainte
d'unicité en base.
> Statut : ✅ Le schéma Prisma a `Community.trainerId` sans `@unique` (✅). L'index
> unique partiel sur `CommunitySubscription` inclut `BANNED` (✅, migration
> `20260731140302_community_subscriptions_active_unique_index`, vérifié par insertion
> réelle rejetée par Postgres).

**10. Upload 2 Go** — URL pré-signée en direct, obligatoire. Jamais de proxy backend.
Liste blanche MIME : mp4, pdf, zip, xlsx, docx, png, jpg, webp.
Quota par formateur selon son plan SaaS.
> Statut : ⚠️ Inchangé. `src/lib/s3.ts` implémente `presignUpload` sans proxy (✅).
> `src/lib/courses.ts` définit `COURSE_UPLOAD_LIMITS` avec mp4 2 Go, pdf 10 Mo, images
> 5 Mo (✅). La liste blanche MIME ne correspond toujours pas exactement à l'arbitrage :
> zip, xlsx, docx ne sont pas dans `COURSE_UPLOAD_LIMITS` (⚠️ écart, non traité dans
> cette session). Le quota par plan SaaS n'est toujours pas implémenté (📋) — sa valeur
> est désormais fixée par l'**arbitrage 54** : 40 Go, blocage en écriture au dépassement.

**11. Commission 15 %** — Sur le prix payé, prélevée au moment de la vente (le wallet
formateur est crédité de 85 %), identique pour les ventes directes et via communauté.
Le taux est porté par formateur (`TrainerProfile.commissionRate`, défaut 0.15) et
snapshoté sur chaque `Purchase`.
> Statut : ✅ Inchangé. `TrainerProfile.commissionRate Float @default(0.15)` dans le
> schéma. `purchases.ts` snapshotte `commissionRate`, `trainerShareFcfa`,
> `platformShareFcfa` sur chaque `Purchase`. `wallet.ts` crédite via
> `creditWalletOnPurchase`, désormais appelée **uniquement** depuis les handlers webhook
> réels `/api/webhooks/stripe` et `/api/webhooks/cinetpay` (plus de crédit direct à
> l'initiation de l'achat).

---

## Arbitrages 12-19 — Litiges & chargebacks (Lot 2)

**12. `PARTIAL_REFUND` autorisé** — Le remboursement est réparti au prorata :
NkamVa rend sa commission proportionnellement, le formateur est débité de 85 % du
montant remboursé. Pas d'absorption unilatérale.
> Statut : ✅ `src/lib/disputes.ts` (`completeRefund`) implémente le prorata :
> `debitedAmount = 85% × refundAmountFcfa`, `releasedAmount = reservedAmountFcfa -
> debitedAmount`, `FundReservation` → `PARTIALLY_DEBITED`.

**13. Wallet négatif autorisé** (`reservedBalance > balance`). Pas de contrainte CHECK.
Tout nouveau retrait bloqué tant que le solde retirable est négatif. Le solde négatif
est apuré automatiquement sur les ventes suivantes. Alerte Finances si un wallet reste
négatif > 60 jours.
> Statut : ✅ Pas de contrainte CHECK sur `Wallet` (schéma inchangé). `negativeSince`
> est synchronisé par `payouts.ts` (`markPayoutPaid`). `requestPayout` bloque tout
> nouveau retrait dépassant le solde retirable (`balance - reservedBalance -
> pendingPayoutBalance`). Le job d'alerte 60 jours (`alertNegativeWallets`,
> `src/lib/wallet-reconciliation.ts`) est câblé via `node-cron` (`WALLET_NEGATIVE_ALERT`,
> quotidien 03:30 UTC, voir `src/lib/jobs.ts`).
> **Écran depuis le 3 août 2026** — `/admin/retraits/{id}` décompose le solde du
> formateur **à l'instant de l'instruction** (crédité, réservé par litiges, immobilisé
> par retraits, retirable) et signale un retirable négatif avec la règle qui l'explique.
> Le solde affiché est lu maintenant, pas au moment de la demande : c'est celui-là qui
> décide, et `approvePayout` le re-vérifie de toute façon.

**14. `CourseView` — deux signaux distincts** *(corrige l'arbitrage 2)*
- Formats streamés (vidéo) : `watchedSeconds`, règle des 30 % applicable.
- Formats téléchargeables (PDF, kit, Notion, tableur) : booléen `downloaded`.
  Un contenu téléchargé est réputé consommé à 100 %. La règle automatique des 30 %
  NE S'APPLIQUE PAS : le remboursement passe en décision manuelle du support.

Un snapshot de la consommation est figé à l'ouverture du litige.
> Statut : ✅ `src/lib/access.ts` implémente les deux signaux (`updateWatchProgress`,
> `markCourseDownloaded`, `getConsumptionPercent`), inchangé. Le `ConsumptionSnapshot`
> est désormais figé à l'ouverture du litige par `disputes.ts`
> (`computeConsumptionSnapshot`, appelé depuis `openDispute`).

**15. Refunds CinetPay** — Tentative API, fallback manuel explicite en cas d'échec,
avec tâche Finances et audit. Idempotence obligatoire (clé = `disputeId`), timeout 30 s,
pas de retry automatique silencieux.
> ⚠️ **Écart temporaire assumé, toujours actif** — en l'absence de clés API CinetPay, le
> refund part directement en `ManualRefundTask` sans tentative d'appel synchrone
> (`resolveDisputeWithRefund` dans `disputes.ts`). Pas de tentative API ni de timeout
> 30 s codés : le chemin « tentative échouée → fallback » n'existe pas, seul le fallback
> direct existe. À rétablir dès que les clés sont disponibles.
> Statut : ✅ pour la partie implémentée — `disputes.ts` et
> `src/lib/manual-refund-tasks.ts` existent, avec les routes
> `/api/admin/manual-refund-tasks/*` (Finances). `ManualRefundTask` est exploité par
> `resolveDisputeWithRefund` (création), `completeManualRefundTask` (FR3/FR4 appliqués),
> `cancelManualRefundTask` (FR5, libère sans débiter). `CINETPAY_API_KEY` et
> `CINETPAY_SECRET_KEY` sont dans `.env` (vides). `.env` pointe vers Postgres, pas SQLite.

**16. Formateur notifié, hors du fil** — Notifié à l'ouverture et à la résolution, mais
ne participe pas à la conversation apprenant/support. La notification inclut un lien
« Contester cette décision » qui crée un ticket support rattaché au `disputeId`.
> Statut : ⚠️ Partiel. `disputes.ts` notifie le formateur **à l'ouverture** (`openDispute`
> → `notify()` + email). **La notification à la résolution n'est pas envoyée au
> formateur** — `releaseReservation`/`completeRefund` ne notifient que l'apprenant. Le
> `SupportTicket` de contestation existe (`contestDispute`, route
> `/api/trainer/disputes/{id}/contest`) mais n'est pas conditionné à un lien reçu dans
> une notification de résolution puisque celle-ci n'existe pas encore.

**17. Fusion des litiges & prévention du double débit**
- Blocage de l'ouverture manuelle si un litige `STRIPE_CHARGEBACK` est actif sur la
  même vente ; redirection vers le fil existant.
- Cas critique inverse : si un chargeback arrive alors qu'un remboursement a **déjà**
  été accordé, ne pas l'accepter — contestation automatique auprès de Stripe avec la
> preuve du refund, alerte Finances. Aucun double débit.
> Statut : ✅ `disputes.ts` (`openDispute`) rejette `DISPUTE_ALREADY_ACTIVE` si un litige
> est déjà en cours sur l'achat (tous types confondus, y compris chargeback — plus large
> que le texte de l'arbitrage mais couvre le cas). `resolveDisputeWithRefund` vérifie
> `Purchase.providerDisputeActive` → 409 `PROVIDER_DISPUTE_ACTIVE`.
> `openDisputeFromChargeback` : si `Purchase.refundedAt` non nul, appelle
> `stripe.disputes.update(id, {submit:true})` (contestation) au lieu de créer un litige,
> journalise `DOUBLE_DEBIT_PREVENTED`, alerte Finances. Le webhook
> `/api/webhooks/stripe` gère `charge.dispute.created`/`charge.dispute.closed`. Le SDK
> `stripe` est installé (`package.json`).

**18. Délai d'ouverture** — Ouverture possible jusqu'au 14e jour inclus. L'accès à la
ressource est suspendu dès l'ouverture du litige, et rétabli si le litige est rejeté.
> Statut : ✅ `access.ts` vérifie `Purchase.accessSuspended` (inchangé). `openDispute`
> suspend l'accès à l'ouverture et vérifie les 14 jours. `releaseReservation` rétablit
> l'accès sur rejet (T7) et auto-timeout (T8).

**19. Visibilité du motif** — Le formateur voit le `reason` (enum) et le titre de la
ressource, jamais le `reasonDetail` libre.
> Statut : ✅ La route `/api/trainer/disputes` (`listTrainerDisputes`) sélectionne
> explicitement `reason` et exclut `reasonDetail` du `select` Prisma.

---

## Arbitrages 20-30 — Vérification RIB & payouts (Lot 3)

**20. Qui vérifie** — Finances et Super-admin. Modération n'a aucun accès aux moyens
de paiement (symétrique de l'arbitrage 7).
> Statut : ✅ `requireAdminSubRole('FINANCES', 'SUPER_ADMIN')` protège toutes les routes
> `/api/admin/payout-methods/*` et `/api/admin/payouts/*`. Depuis le 3 août 2026, les
> **pages** `/admin/moyens-de-paiement` appliquent la même règle et redirigent la
> Modération vers `/admin` — la garde n'est pas seulement dans l'API.

**21. Nom légal vérifié** — À l'approbation du document `ID_CARD`, l'admin Modération
saisit et confirme le champ `verifiedLegalName`. Finances lit ce champ pour la
comparaison et n'a **jamais** accès à l'image de la pièce d'identité.
Si `verifiedLegalName` est absent, la vérification du RIB est impossible :
409 `IDENTITY_NAME_MISSING`.
> Note d'implémentation : le champ vit sur `TrainerProfile` (décidé au Lot 0), pas sur
> `TrainerApplication`, car il doit survivre à la candidature.
> Statut : ✅ `trainer-applications.ts` (`approveApplication`, T3) saisit
> `TrainerProfile.verifiedLegalName` fourni par l'admin Modération. `payout-methods.ts`
> (`createPayoutMethod`) bloque la création si `verifiedLegalName` est absent, avec le
> code `IDENTITY_NAME_MISSING` en 409 — exactement le nom et le statut de l'arbitrage
> (*l'écart de nommage signalé par une version antérieure de cette note n'existe pas ou
> plus : vérifié le 3 août 2026 dans `payout-methods.ts:117` et `api.ts:136`*).
> Finances n'a jamais de route lui donnant
> accès à l'image de pièce d'identité (routes Lot 1 documents restreintes à
> `MODERATION`/`SUPER_ADMIN`).

**22. Méthode de vérification, en couches**
- a. Name lookup opérateur si disponible (mobile money) : comparaison automatique au
  `verifiedLegalName` après normalisation (casse, accents, ordre des mots).
- b. Tout écart, ou absence de lookup → revue manuelle Finances sur pièce fournie.
- c. IBAN uniquement : micro-virement à référence en complément.

**Aucune vérification purement déclarative.** Un RIB non vérifié vaut 0 point au score,
jamais un score partiel.
> ⚠️ **Écart temporaire assumé, toujours actif** — aucune API opérateur n'est
> disponible ; la couche (a) reste inactive. Mais **la comparaison elle-même est
> désormais écrite et testée** (3 août 2026) : `src/lib/name-match.ts` implémente la
> normalisation demandée par le texte de l'arbitrage — casse, accents (via `NFD` +
> `\p{M}`, pour qu'un accent ne coupe pas le mot en deux), ponctuation, apostrophes et
> traits d'union, formes juridiques (`SARL`, `SA`, `Ltd`…), mots vides, et **ordre des
> mots** par tri des jetons. La comparaison exige des jetons *identiques* : un
> sous-ensemble est un `MISMATCH`, parce que « Sarr Formation » et « Sarr Formation
> Digitale » sont deux entités. 9 tests unitaires purs.
> La séparation est nette : `fetchOperatorAccountName()` est le **seul** point où une
> information externe entre, et il retourne `null` faute de provider ;
> `lookupMobileMoneyName()` ne compare que ce qu'il en reçoit. Tous les `PayoutMethod`
> MOBILE_MONEY passent donc toujours en revue manuelle.
> `AUTO_VERIFIED` n'est atteignable que sur un `MATCH` renvoyé par une vraie API — aucun
> chemin ne l'atteint aujourd'hui, **y compris quand le nom déclaré est identique au nom
> légal vérifié** (corrigé cette session : l'ancienne implémentation comparait
> `holderName` à `verifiedLegalName` en local et auto-vérifiait sur concordance, ce qui
> ne prouvait rien — supprimé, testé par `tests/lot3-invariants.test.ts`).
> Statut : ✅ pour ce qui est implémenté — `payout-methods.ts` existe
> (`createPayoutMethod`, `verifyPayoutMethod` avec MANUAL_FINANCE/MICRO_DEPOSIT,
> `confirmMicroDeposit`). Couche (c) IBAN : micro-dépôts (2 montants distincts 1-99,
> stockés en clair) ✅. « Aucune vérification purement déclarative » : ✅ désormais
> réellement garanti pour Mobile Money (c'était l'écart corrigé cette session).
> **Corrigé le 3 août 2026, trouvé en construisant l'écran d'instruction** — un second
> appel `MICRO_DEPOSIT` re-tirait les montants. Le garde sur `updatedAt` ne protégeait
> pas : l'écran se rafraîchit après le premier tirage et repart avec une valeur à jour.
> Finances aurait remplacé des montants déjà virés, et le formateur, saisissant les
> bons, aurait été compté en échec — trois fois jusqu'au blocage. `verifyPayoutMethod`
> refuse désormais avec `MICRO_DEPOSIT_ALREADY_ISSUED` (409), et l'écran cesse de
> proposer l'action. Testé.

**23. Délais**
- SLA de revue manuelle : 48 h ouvrées.
- Carence obligatoire : 72 h après ajout ou modification d'un moyen de paiement avant
  tout retrait, même si la vérification a abouti plus tôt. Pendant la carence, le RIB
  vaut 0 point.
- Maximum 3 soumissions rejetées, puis blocage et escalade Super-admin. Le compteur
  vit au niveau du formateur, pas du `PayoutMethod` (l'archivage ne le remet pas à zéro).
> Statut : ✅ `User.payoutMethodRejectionCount` (schéma, inchangé). `PayoutMethod.
> carenceUntil` (schéma, inchangé). Constantes `PAYOUT_METHOD_CARENCE_HOURS=72`,
> `PAYOUT_REVIEW_SLA_HOURS=48` (dans `payouts.ts`), `PAYOUT_METHOD_MAX_REJECTIONS=3`
> désormais présentes. Job d'expiration de carence (`expirePayoutMethodCarence`) et
> d'alerte SLA (`alertPayoutMethodSlaBreaches`) câblés via `node-cron`, horaire (voir
> `src/lib/jobs.ts`). Testé : 3 rejets → `BLOCKED` + compteur incrémenté
> (`tests/lot3-invariants.test.ts`). Le SLA « ouvrées » du texte de l'arbitrage est
> simplifié en 48h calendaires dans le code (⚠️ écart mineur, non traité).

**24. Modification du RIB** — Re-vérification complète. Le RIB repasse à 0 point, la
carence de 72 h redémarre, et une notification est envoyée à l'ancienne adresse email
**et** à l'ancien numéro enregistré, avec un lien de signalement.
> ⚠️ **Écart temporaire, toujours actif** — aucun provider SMS n'est configuré ; la
> notification à l'ancien numéro n'est pas envoyée. **Nouvel écart constaté cette
> session** : la notification à l'ancienne adresse email n'est pas non plus envoyée —
> `createPayoutMethod` archive l'ancien moyen de paiement mais n'notifie personne.
> Statut : ⚠️ Archive ancien + crée nouveau + relance la carence 72h : ✅
> (`createPayoutMethod`, transaction atomique). Notification à l'ancien email/téléphone
> avec lien de signalement : ❌ non implémentée. `trainerEmailSnapshot` et
> `trainerPhoneSnapshot` sont bien capturés sur chaque `PayoutMethod` (schéma) mais rien
> ne les lit pour notifier.

**25. Premier retrait** — Toujours en revue manuelle Finances, quel que soit le score
KYC. L'auto-approbation à ≥ 80 ne s'applique qu'à partir du deuxième retrait.
> Statut : ✅ `payouts.ts` (`requestPayout`) force `IN_REVIEW` si `kyc.firstPayout`
> (aucun `Payout` au statut `PAID` existant), indépendamment du score. Testé.
> **Écran depuis le 3 août 2026** — `/admin/retraits/{id}` affiche un bandeau « Premier
> retrait » qui rappelle la règle à l'instructeur, et le **snapshot KYC figé à la
> demande** (score, badge, les 5 critères, `carenceHolds`) plutôt que le score du jour :
> c'est lui qui a décidé de la voie suivie, la décision doit rester auditable même si le
> formateur évolue ensuite.

**26. Un seul `PayoutMethod` actif** par formateur. L'ajout d'un nouveau désactive
l'ancien, qui reste archivé pour l'audit.
> Statut : ✅ `createPayoutMethod` archive l'actif précédent dans la même transaction
> (`isActive=false`, `archivedAt`, `verificationStatus='ARCHIVED'`). Testé.

**27. Écart de nom non résolu** — Finances ne tranche pas seul. Escalade Super-admin,
qui a accès aux deux (identité et moyen de paiement).
> Statut : ✅ Routes `/api/admin/payout-methods/escalations` (liste des `BLOCKED`) et
> `/api/admin/payout-methods/{id}/escalation-resolve` (`FORCE_VERIFY`/`BLOCK`/`RESTORE`,
> `SUPER_ADMIN` uniquement) implémentées dans `payout-methods.ts`
> (`resolvePayoutMethodEscalation`). **Écran depuis le 3 août 2026** :
> `/admin/moyens-de-paiement` a un onglet « Escalades », et le détail expose les trois
> décisions **au seul Super-admin** — un admin Finances y lit le dossier et voit écrit
> que l'arbitrage ne lui revient pas, plutôt que de trouver des boutons qui échouent. L'enum `VerificationMethod.ESCALATION` existe dans
> le schéma mais n'est pas explicitement assigné par le code (le champ
> `verificationMethod` n'est pas mis à jour lors d'une escalade — ⚠️ écart mineur).

**28. Nature du compte de versement** — Deux branches exclusives, pas de troisième voie :
- `INDIVIDUAL` : le titulaire doit correspondre au `verifiedLegalName`. Aucun compte de
  tiers accepté, quel que soit le lien de parenté ou le motif invoqué.
- `BUSINESS` : compte au nom d'une entité juridique. Exige le document d'immatriculation
  (RCCM ou équivalent) et la preuve que le formateur en est le représentant légal. La
  comparaison porte sur la dénomination sociale, et le `verifiedLegalName` doit figurer
  comme représentant.

Aucune auto-déclaration du type « ce compte m'appartient » : elle n'apporte aucune
garantie et n'est pas demandée.
> Statut : ⚠️ **Recalé le 3 août 2026.** Les deux branches sont désormais réellement
> distinctes à la saisie et au dépôt :
> - `validateMethodInput` exige `holderName` en INDIVIDUAL, et `businessName` +
>   `businessDocS3Key` + `legalRepProofS3Key` en BUSINESS (✅, inchangé) ;
> - les deux documents ont leur **route de présignature** (`POST /api/trainer/
>   payout-methods/documents/upload`, PM0) et ne sont rattachés qu'à la création, dans
>   la transaction, via une `PendingAttachment` de scope `PAYOUT_METHOD:<kind>`. Une clé
>   inventée, expirée, appartenant à un autre formateur, ou du mauvais type est refusée
>   en `ATTACHMENT_INVALID` (✅, 6 tests d'invariants + 1 test de route) ;
> - Finances peut les consulter via `GET /api/admin/payout-methods/{id}/documents/{kind}`,
>   redirection 302 signée et **journalisée** (`PAYOUT_METHOD_DOCUMENT_VIEW`) — sans quoi
>   les documents exigés seraient invérifiables. Ce sont des documents commerciaux, pas
>   des pièces d'identité : la décision 21 reste entière.
>
> La comparaison de la dénomination sociale est **écrite** depuis le 3 août 2026
> (voir décision 22), et surtout **correctement ciblée** : `expectedAccountName()` fait
> porter la comparaison sur `businessName` en BUSINESS et sur `verifiedLegalName` en
> INDIVIDUAL. Avant, le nom du compte était comparé au nom de la personne quelle que
> soit la nature — le jour où une API opérateur répondra, tout compte d'entreprise
> aurait produit un `MISMATCH` systématique. Le défaut était latent, la couche (a)
> n'étant pas branchée.
>
> `getPayoutMethodDetail()` expose en plus un bloc `nameComparison` **dérivé à la
> lecture** (jamais stocké : un instantané figé deviendrait faux si le nom légal
> change) : nom attendu et sa forme normalisée, nom opérateur et le sien, résultat de
> comparaison, et `businessIsSoleTrader` — la dénomination sociale se réduit au nom de
> la personne, cas légitime que Finances doit voir. **Aucun de ces champs ne touche
> `verificationStatus`** : c'est une aide à la décision, pas une vérification.
>
> Le bloc `nameComparison` **a son écran depuis le 3 août 2026** :
> `/admin/moyens-de-paiement/{id}` met les deux noms face à face avec leur forme
> normalisée, et signale l'entreprise individuelle. Les deux documents s'ouvrent depuis
> cette page, chaque ouverture étant journalisée.
>
> Ce qui reste absent (⚠️) : la **preuve** que le formateur est le représentant légal
> reste lue par un humain sur les documents — l'écran le dit explicitement — et les
> deux branches convergent toujours vers la même revue manuelle Finances
> (`MANUAL_FINANCE`).

**29. Pédagogie avant saisie** — L'écran d'ajout d'un moyen de paiement affiche la règle
**avant** le formulaire. Le choix `INDIVIDUAL` / `BUSINESS` est fait en premier et
conditionne le formulaire.
> Statut : ✅ **Implémenté le 3 août 2026** —
> `/formateur/portefeuille/moyen-de-paiement` affiche les quatre règles (compte
> personnel obligatoire, vérification jamais déclarative, carence 72 h, blocage à
> 3 refus) **avant** le formulaire, et le choix INDIVIDUAL/BUSINESS est l'étape 1 :
> il commande les champs de l'étape 3 (nom du titulaire *ou* dénomination sociale +
> les deux documents).

**30. Écart de nom détecté** — Message explicite, jamais un rejet opaque : indiquer que
le nom du compte ne correspond pas à l'identité vérifiée, rappeler les deux options
légitimes, proposer le contact support. Ne jamais afficher le `verifiedLegalName`
complet dans ce message.
> Statut : ✅ **Implémenté le 3 août 2026** — `name-mismatch-notice.tsx` porte le
> message en trois parties (ce qui bloque · les deux configurations légitimes · le
> recours au support), affiché quand le moyen actif est `REJECTED`, `BLOCKED`, ou porte
> un `nameLookupResult` en `MISMATCH`. Le nom légal vérifié n'y apparaît pas, et ne le
> peut pas : `TRAINER_METHOD_SELECT` ne l'expose jamais au formateur — l'interdit est
> structurel, pas seulement respecté. Deux codes d'erreur opaques
> (`IDENTITY_NAME_MISSING`, `PAYOUT_METHOD_BLOCKED`) sont par ailleurs traduits dans le
> formulaire.

---

## Arbitrages 31-43 — Communautés, lives et messagerie

*Arbitrages 31 à 39 tranchés le 2 août 2026 avec l'espace apprenant, 40 à 43 le même jour
en ouvrant l'espace formateur. Aucun modèle correspondant n'existe encore : les écrans
concernés (`/messagerie`, `/mes-lives`, `/mes-lives/live/[sessionId]`,
`/mes-lives/replay/[replayId]`, `/formateur/lives`,
`/formateur/lives/[sessionId]/console`) affichent des données de démonstration. Le détail
de ce qu'il reste à brancher est dans `docs/espace-apprenant-a-brancher.md`.*

**31. Prise de parole en live** — Le live est une visioconférence, pas une diffusion :
apprenants et formateur peuvent tous parler. La main levée ne conditionne rien, elle
signale seulement qu'un participant souhaite prendre la parole — une formule de
politesse, pas une permission à accorder.
> Statut : 📋 L'écran expose micro, caméra et main levée
> (`src/app/(app)/mes-lives/live/[sessionId]/live-room.tsx`), sans transport temps réel.
> `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` sont dans `.env` et lus par
> personne. **Conséquence de coût** : tout participant émet, le dimensionnement n'est pas
> celui d'une diffusion un-vers-tous.

**32. Rattachement du live** — Un live appartient à une **communauté**, jamais à une
ressource.
> Statut : 📋 `Course.livekitRoomName` est donc un vestige : le champ désigne une salle
> rattachée à une ressource, ce que cet arbitrage exclut. À retirer au moment de créer le
> modèle de session.

**33. Périmètre de la messagerie** — Un apprenant ne peut échanger avec un formateur que
s'il est membre de sa communauté. L'achat d'une ressource à l'unité n'ouvre aucun droit
de conversation : le fil se rattache à l'abonnement communautaire, pas à l'achat.
> Statut : ✅ Livré le 4 août 2026. `Conversation` porte `communityId` — jamais `courseId` —
> et l'unicité `(communityId, learnerId)` donne un seul fil par membre. `writeBlockFor()`
> dans `src/lib/messaging.ts` refuse l'écriture sans adhésion ouverte, des deux côtés.
> `/messagerie` lit la base ; `message-data.ts` est supprimé.

**34. Accès après résiliation** — Le membre qui quitte une communauté conserve l'accès
aux replays et aux ressources de la communauté **intégrés pendant sa période
d'adhésion**. Il perd l'accès à tout ce qui est ajouté après sa sortie. Pour un replay,
**c'est la date du live qui fait foi**, pas celle de la mise en ligne de
l'enregistrement.
> **Complété par l'arbitrage 44** : cette règle décrit l'état d'un **ancien** membre.
> Elle cesse de s'appliquer s'il se réabonne.
> Statut : 📋 Demande deux choses absentes : une relation `Community` → `Course` (elle
> n'existe pas, l'onglet « Incluses (communauté) » de `/mes-ressources` est bloqué pour
> cette raison) et une date d'intégration par contenu, pour trancher ce qui précède la
> sortie. La période d'adhésion est déjà lisible sur `CommunitySubscription`
> (`periodStart`, `periodEnd`, `canceledAt`).

**35. Le formateur modère la parole** — Il peut couper le micro de tout le monde, d'un
seul participant ou de plusieurs, et peut aussi rouvrir un micro. Le participant coupé
par l'animateur ne se réactive pas seul.
> Statut : 📋 Côté apprenant, l'état est déjà rendu :
> `LiveParticipant.mutedByHost` désactive la commande micro et affiche « Votre micro a été
> coupé par l'animateur ». **Le geste de modération lui-même appartient à l'écran
> formateur** — c'est là qu'il faudra les commandes « couper tout le monde », « couper ce
> participant », « rouvrir ».

**36. File des demandes de parole** — Les mains levées sont **ordonnées et numérotées**,
pour savoir qui a demandé la parole en premier.
> Statut : 📋 Côté apprenant : `LiveParticipant.handRaisedAt` porte l'horodatage, la file
> est triée dessus, chaque main levée reçoit son rang (pastille sur l'avatar) et
> l'apprenant voit sa propre position. Le formateur devra voir la même file, et c'est lui
> qui la consomme quand il donne la parole.

**37. Locuteur actif** — L'interface indique qui parle à un instant donné.
> Statut : 📋 Côté apprenant : `LiveParticipant.speaking` affiche « X a la parole » sous
> la scène et une icône dans la liste des participants. La détection réelle viendra du
> transport temps réel (LiveKit la fournit) ; rien à modéliser en base.

**38. Enregistrement automatique** — Tout live est enregistré, sans décision au
lancement. Un replay existe donc systématiquement.
> Statut : 📋 Aucun enregistrement n'est déclenché : les variables `MUX_*` et `LIVEKIT_*`
> de `.env` ne sont lues par aucun code.

**39. Historique de conversation conservé** — Quand l'adhésion s'arrête, l'écriture
cesse (arbitrage 33) mais **le fil reste lisible**, pour que le membre le retrouve s'il
revient dans la communauté.
> Statut : ✅ Livré le 4 août 2026. La fermeture d'une souscription ne touche pas la
> conversation ; `getConversation()` ne demande que d'en être participant, quand
> `sendMessage()` exige l'adhésion. L'unicité est **totale et non partielle** : un membre
> qui revient retrouve son fil au lieu d'en ouvrir un second à côté.

**40. Pas d'exclusion en séance** — Le formateur peut couper un micro (arbitrage 35), il
ne peut pas retirer quelqu'un de la session en cours. Couper et exclure ne sont pas le
même geste : écarter durablement quelqu'un relève du bannissement de la communauté
(`CommunitySubscription.bannedAt`), pas de la console d'animation.
> Statut : 📋 La console formateur n'expose aucune commande d'exclusion, et le dit
> explicitement à l'écran. **Ne pas en ajouter** : c'est une absence décidée, pas un
> oubli.

**41. Réouverture du micro par la main levée** — Un participant coupé par l'animateur
n'a qu'un canal pour demander son micro : lever la main. Il n'y a pas de demande de
réouverture distincte de la demande de parole.
> Statut : 📋 Conséquence directe : **une seule file** à modéliser et à afficher, celle
> de l'arbitrage 36. Côté console, « Donner la parole » lève le verrou et baisse la main
> d'un même geste. Rouvrir un micro **rend la commande** au participant, cela ne l'actionne
> pas à sa place.

**42. Le salon du live est conservé** — Les messages échangés pendant une session ne
disparaissent pas à sa fin : ils sont rattachés au replay et restent lisibles.
> Statut : 📋 Conséquence : le salon entre dans le périmètre de modération, au même titre
> que la messagerie privée (question ouverte de l'arbitrage 33). Il demande un modèle de
> messages rattaché à la session, pas un canal éphémère.

**43. Téléchargement d'un replay lié au plan** — La possibilité de télécharger un replay
dépend de la formule d'abonnement de la communauté. Ce n'est ni un réglage par session,
ni une règle uniforme de plateforme.
> ⚠️ **Requalifié par l'arbitrage 55** : les deux formules (mensuelle, annuelle) ayant
> des droits identiques (arbitrage 49), aucune ne refuse le téléchargement — il devient
> un droit uniforme de tout membre. Ce qui subsiste ici, c'est l'interdit : **pas de case
> « téléchargeable » par session**.
> Statut : 📋 Le champ `downloadable` par replay des données de démonstration est donc
> faux : la règle se lira sur le plan. **Ne pas ajouter de case « téléchargeable »** dans
> l'écran formateur. Suppose de modéliser les formules d'abonnement d'une communauté, ce
> qui n'est pas fait.

---

## Arbitrages 44-46 — Réabonnement, ressources incluses, capacité

*Tranchés le 2 août 2026. Ils referment les trois dernières questions ouvertes de
`docs/espace-apprenant-a-brancher.md`.*

**44. Réabonnement — rattrapage complet** — L'ancien membre qui revient dans une
communauté **récupère tout ce qui y a été ajouté pendant son absence** : replays et
ressources incluses. Il n'y a pas de « trou » dans son accès.
> Conséquence de modélisation, importante : l'arbitrage 34 (accès figé à la période
> d'adhésion) ne décrit que l'état d'un **ancien** membre. Un membre **actif** voit
> l'intégralité de ce qui est lié à la communauté à l'instant T, sans filtre de date.
> La date d'intégration par contenu (et la date du live pour un replay) ne sert donc
> qu'à calculer l'accès résiduel après sortie — jamais à restreindre un abonné actif.
> Un membre réabonné passe simplement du filtre à l'absence de filtre.
> Statut : 📋 Demande la relation `Community` → `Course` (absente) et la date
> d'intégration par contenu.
> ⚠️ La simplification « un abonné actif n'est jamais filtré » **ne tient que pour les
> ressources encore liées** : l'arbitrage 48 (déliaison) rouvre le besoin d'historique
> des adhésions. Voir la formule d'accès complète en 48.

**45. Deux circuits de ressources, distincts** — L'adhésion à une communauté ne donne
accès qu'aux ressources que **le formateur a explicitement liées à sa communauté** :
celles-là sont gratuites pour les membres. Les ressources que le formateur publie dans
la marketplace **restent payantes pour tout le monde, membres compris** : un membre qui
les veut les achète comme n'importe quel apprenant.
> Conséquence : la relation `Community` → `Course` est une **décision explicite et
> opt-in du formateur**, pas un effet de bord de la publication d'une ressource. Aucune
> ressource n'entre dans une communauté par défaut.
> Conséquence sur l'onglet « Incluses (communauté) » de `/mes-ressources` : il ne
> liste que les ressources liées, jamais le catalogue du formateur.
> Statut : 📋 Rien n'existe. La relation `Community` → `Course` reste à créer, avec la
> date d'intégration exigée par les arbitrages 34 et 44.

**46. Capacité d'une session live** — La capacité maximale d'une session est le **nombre
d'apprenants de la communauté + le formateur**. Il n'y a pas de plafond de plateforme
distinct, ni de jauge à régler par session : la communauté est sa propre limite.
> Conséquence : aucun écran « session complète » à concevoir côté apprenant — un membre
> ne peut jamais être refusé pour cause de capacité. Le contrôle d'accès à la salle
> reste celui de l'arbitrage 32 (abonnement actif à la communauté), rien de plus.
> ⚠️ **Conséquence de coût, à garder en tête** : l'arbitrage 31 fait émettre tout
> participant. Une communauté à plusieurs centaines de membres actifs produit donc une
> visioconférence de plusieurs centaines d'émetteurs, ce qu'aucun fournisseur temps réel
> ne facture comme une diffusion un-vers-tous. La règle est tranchée côté produit ; le
> dimensionnement (et un éventuel garde-fou technique) reste à instruire.
> Statut : 📋 Aucun modèle `LiveSession`. Rien à implémenter au-delà de l'absence
> volontaire de champ « capacité » sur la future session.

---

## Arbitrages 47-62 — Circuits, déliaison, abonnement, rétention, stockage, tarification

*Tranchés les 2 et 3 août 2026, dans la foulée des arbitrages 44-46 dont ils précisent
les conséquences.*

**47. Les deux circuits sont exclusifs** — Une ressource est **soit** incluse dans la
communauté (gratuite pour les membres), **soit** vendue dans la marketplace. Jamais les
deux. Le formateur choisit par ressource.
> Conséquence de modélisation : le circuit est une propriété de la ressource, pas un
> effet de bord d'une table de liaison. `Course.priceFcfa` (aujourd'hui `Int` non nul)
> devient sans objet pour une ressource incluse — à rendre optionnel, ou à doubler d'un
> champ de circuit qui le neutralise.
> Conséquence produit : un membre ne peut jamais avoir « payé pour rien » une ressource
> qu'il aurait ensuite reçue gratuitement par son abonnement — le cas n'existe plus.
> Statut : 📋 Rien n'existe. `Course` n'a aucun marqueur de circuit.

**48. Déliaison possible, accès acquis conservé** — Le formateur peut retirer une
ressource de sa communauté. Elle disparaît alors pour les futurs membres, mais **tout
membre qui y avait accès pendant la liaison le conserve**. Symétrique de l'arbitrage 34,
vu depuis le formateur.
> ⚠️ **Corrige la simplification annoncée à l'arbitrage 44.** Avec la déliaison, la règle
> d'accès n'est plus « abonné actif → aucun filtre ». Elle devient :
> ```
> accès(apprenant, ressource, communauté) =
>     (abonnement actif  ET  liaison active)
>  OU (une période d'adhésion chevauche la période de liaison)
> ```
> La seconde branche **impose bien de conserver l'historique des adhésions** et une
> période de liaison bornée (`linkedAt`, `unlinkedAt`) — la déliaison n'est donc pas une
> suppression de ligne. `CommunitySubscription` porte déjà `periodStart`/`periodEnd`/
> `canceledAt`, et l'index unique partiel n'interdit qu'un second abonnement **actif** :
> l'historique des passages successifs est représentable en l'état.
> Statut : 📋 La table de liaison `Community` → `Course` reste à créer, avec `linkedAt`
> et `unlinkedAt` dès l'origine.

**49. Un seul abonnement plateforme, deux cadences** *(objet corrigé le 3 août 2026 —
la première rédaction l'avait attribué à tort aux communautés)* — L'abonnement du
**formateur à NkamVa** est le seul abonnement de plateforme. Il ne subsiste que deux
cadences, **mensuelle et annuelle**, aux droits identiques : tout est compris, la seule
restriction est le stockage (arbitrage 54).
> Conséquence sur le schéma : `enum TrainerPlan { STARTER, PRO, EXPERT }` **disparaît**.
> Trois paliers de droits n'ont plus d'objet ; il ne reste qu'une cadence de facturation.
> `TrainerProfile.plan` et son index `@@index([plan])` sont à requalifier, pas seulement
> à renommer — c'est une migration, sur un champ qui a une valeur par défaut (`STARTER`)
> sur toutes les lignes existantes.
> Conséquence : **aucune matrice de droits à modéliser**, nulle part. Ni par plan
> formateur, ni par formule communautaire.
> ⚠️ **Ce que cet arbitrage ne dit pas** : la cadence de l'abonnement d'un **apprenant à
> une communauté** est un autre sujet — c'est le produit du formateur, pas celui de
> NkamVa. `Community.priceFcfa` (prix unique) reste donc en vigueur par défaut. Voir
> « Points non arbitrés ».
> ⚠️ **Neutralise l'arbitrage 43**, requalifié par l'arbitrage 55.
> Statut : 📋 `TrainerPlan` à trois valeurs toujours dans le schéma.

**50. Les replays ont une durée de conservation limitée** — Un replay n'est pas conservé
indéfiniment. Le coût de stockage d'un enregistrement vidéo, produit automatiquement à
chaque live (arbitrage 38), ne le permet pas.
> Conséquence : un job de purge (le socle `jobs.ts` sait déjà en porter), un état
> « expiré » distinct de « absent », et un message dédié sur l'écran replay.
> Statut : 📋 Durée fixée par l'arbitrage 51.

**51. Replays conservés 24 mois** — Un replay reste disponible **24 mois après la date du
live** — la même date que celle qui fait foi pour l'arbitrage 34 — puis il est purgé.
> Conséquence de coût, assumée : l'enregistrement étant automatique (arbitrage 38), deux
> années de vidéo s'accumulent avant la première purge. Le pic de stockage n'est donc
> atteint qu'au bout de 24 mois d'exploitation, et pas plus tôt.
> Statut : 📋 Job de purge à écrire (`jobs.ts` sait déjà porter des tâches périodiques,
> `s3.ts` sait supprimer). L'écran replay devra distinguer « expiré » de « absent ».

**52. Changement de cadence à l'échéance** — Le passage du mensuel à l'annuel (ou
l'inverse) est enregistré immédiatement mais ne prend effet qu'au **renouvellement**. La
période en cours n'est ni écourtée, ni recalculée.
> Conséquence, volontairement économe : **aucun prorata à calculer**, aucun remboursement
> partiel, aucune écriture wallet à l'instant du changement — donc aucune interaction
> avec les réservations de litige de l'arbitrage 8. Le changement est une intention
> stockée sur l'abonnement, appliquée au renouvellement.
> Statut : 📋 `TrainerProfile` porte `subscriptionCurrentPeriodEnd` et
> `subscriptionCanceledAt`, mais aucun champ de cadence souhaitée pour le prochain
> renouvellement.

**53. Bascule de circuit à sens unique** — Une ressource vendue peut devenir incluse dans
la communauté. **L'inverse est interdit** : ce qui a été annoncé comme inclus ne repasse
jamais derrière un paywall.
> Conséquence : un membre ne voit jamais une ressource incluse se transformer en ressource
> payante. La déliaison de l'arbitrage 48 reste possible — elle retire la ressource du
> catalogue communautaire sans la remettre en vente, et sans reprendre l'accès acquis.
> Les acheteurs passés d'une ressource devenue incluse gardent la leur : l'achat est
> définitif, le prix est déjà snapshoté sur `Purchase`, rien à recalculer ni à rembourser.
> Statut : 📋 Rien n'existe. La contrainte est applicative, à poser en même temps que le
> marqueur de circuit de l'arbitrage 47.

**54. Quota de stockage formateur — 40 Go gratuits** — Le quota porte sur le
**formateur**, pas sur la communauté ni sur l'apprenant : c'est lui qui téléverse. 40 Go
inclus, extension payante. **Au dépassement, le téléversement est bloqué et tout
l'existant reste intact** — aucun contenu déjà en ligne ne disparaît pour une raison de
facturation.
> Ferme l'arbitrage 10, dont le « quota par formateur selon son plan SaaS » n'avait
> jamais de valeur chiffrée. La liste blanche MIME et l'absence de proxy de l'arbitrage 10
> restent inchangées.
> Conséquence, à ne pas manquer : le quota doit compter **les replays** (arbitrage 38 :
> tout live en produit un, automatiquement), pas seulement les ressources téléversées à
> la main. Un formateur peut donc épuiser son quota sans avoir rien téléversé lui-même —
> et la purge à 24 mois de l'arbitrage 51 lui rend de la place.
> Conséquence sur le point d'application : l'existant reste servi, donc **le blocage ne
> porte que sur le chemin d'écriture** (`presignUpload` dans `s3.ts`) — jamais sur la
> lecture ni sur les URL présignées de téléchargement.
> Statut : 📋 Rien n'existe. Aucun compteur d'octets par formateur, aucune vérification
> dans `presignUpload`. `COURSE_UPLOAD_LIMITS` (`courses.ts`) plafonne le **fichier**,
> pas le **cumul**.

**55. Téléchargement d'un replay — droit uniforme** *(requalifie l'arbitrage 43)* — Tout
membre d'une communauté peut télécharger les replays auxquels il a accès. Ce n'est pas un
droit de formule (elles sont tout compris, arbitrage 49), et **ce n'est toujours pas un
réglage par session** : cet interdit est la seule chose que l'arbitrage 43 conserve.
> Conséquence : ne pas ajouter de case « replay téléchargeable » dans l'écran formateur —
> l'interdit tient, sa justification change. Le drapeau `downloadable` par replay des
> données de démonstration est à retirer parce qu'il est **toujours vrai**, pas parce
> qu'il faudrait le lire ailleurs.
> Conséquence pratique, à lire avec l'arbitrage 51 : le membre a 24 mois pour télécharger
> ce qu'il veut garder. La purge n'est donc pas une perte sèche.

**56. L'abonnement plateforme peut être gratuit** — Le prix de l'abonnement formateur
peut valoir **zéro**, notamment pour les premiers mois après le lancement.
> Conséquence principale, et c'est la seule qui compte vraiment : **« abonné » et « a
> payé » cessent d'être synonymes**. Un abonnement gratuit est un abonnement pleinement
> `ACTIVE`, sans `Purchase`, sans `subscriptionProvider`, sans `subscriptionProviderId`.
> Tout code qui déduirait l'accès d'un paiement se casserait sur la cohorte de lancement.
> Les trois champs sont déjà nullables sur `TrainerProfile` (✅) — c'est la **logique**
> qui doit être écrite dans ce sens, pas le schéma.
> Conséquence économique : la commission de 15 % (arbitrage 11) n'est pas suspendue par
> la gratuité de l'abonnement. Pendant la période de lancement, c'est **la seule** source
> de revenu de NkamVa sur un formateur.
> Conséquence sur le stockage : la gratuité porte sur l'abonnement, **pas sur
> l'extension de stockage** (arbitrage 54). 40 Go restent 40 Go, y compris gratuitement.
> ⚠️ La gratuité doit être **datée**, pas un statut acquis : un formateur entré pendant
> la promotion doit basculer en payant à une échéance connue. Sans date de fin, la
> cohorte de lancement reste gratuite à vie — un choix légitime, mais qui doit être
> délibéré. Voir « Points non arbitrés ».
> Statut : 📋 Rien n'existe : ni prix d'abonnement en base, ni période promotionnelle.

**57. Réductions** — Le prix affiché n'est pas toujours le prix payé : la cadence
annuelle vaut moins que douze mensualités, et des réductions promotionnelles s'y
ajoutent.
> Conséquence de modélisation, la même que celle déjà retenue pour les ventes :
> **snapshoter le prix réellement consenti sur l'abonnement**, comme `Purchase` snapshote
> déjà `commissionRate`, `trainerShareFcfa` et `platformShareFcfa`. Le tarif public
> changera ; un abonnement en cours ne doit pas changer avec lui.
> Conséquence : une réduction est **un montant, pas un pourcentage affiché** au moment du
> débit — le pourcentage sert à la présentation, le montant fait foi en comptabilité.
> Deux réductions se cumulent alors sans ambiguïté d'arrondi (les montants sont des `Int`
> en FCFA, jamais des `Float` — convention Lot 0).
> Conséquence avec l'arbitrage 52 : une réduction obtenue sur une période ne se reporte
> pas d'office sur la suivante. Le renouvellement recalcule, sauf tarif explicitement
> acquis (voir 56 sur la gratuité datée).
> Statut : 📋 Rien n'existe.

**58. Prix d'une communauté : un prix unique** — L'abonnement d'un apprenant à une
communauté garde **un seul prix**, celui que porte déjà `Community.priceFcfa`. Les deux
cadences de l'arbitrage 49 ne concernent que l'abonnement du formateur à NkamVa.
> Conséquence : **aucun modèle de formule communautaire à créer**, aucune matrice de
> droits, aucun choix de cadence dans le tunnel d'adhésion. Le schéma actuel suffit.
> Statut : ✅ Consommé le 4 août 2026 par le parcours d'adhésion
> (`src/lib/memberships.ts`) : un prix, une cadence mensuelle, aucun choix dans le tunnel.
> ⚠️ Le sens des deux bornes de `CommunitySubscription` s'est précisé à l'usage :
> `periodStart` date **l'entrée dans la communauté** et ne bouge plus, `periodEnd` avance
> à chaque mois réglé. Les avancer toutes deux au renouvellement casse la formule d'accès
> de l'arbitrage 48 — un ancien membre y perd les ressources liées avant son dernier mois.

**59. Le tarif de l'abonnement plateforme est administré, pas déployé** — Le
**Super-admin** bascule l'abonnement formateur de gratuit à payant et inversement depuis
l'interface d'administration, et applique les réductions quand il est payant. La
gratuité de lancement (arbitrage 56) n'est donc pas une date en dur dans le code : c'est
un état du tarif, modifiable sans livraison.
> Conséquence directe : le prix ne peut plus être une constante lue au démarrage. Il vit
> en base, il est daté, et **chaque modification est auditée** — `AuditLog` est écrit
> dans la transaction métier (convention Lot 0), et `Setting` porte déjà `updatedById`.
> Cohérent avec l'arbitrage 7 : le Super-admin a « tout, y compris la configuration ».
> ⚠️ **Jamais de rétroactivité.** Une bascule ou une réduction ne retouche aucune période
> déjà facturée : le montant consenti est snapshoté sur l'abonnement (arbitrage 57), et
> une modification du tarif ne réécrit pas ce snapshot. Sans cette règle, un clic
> d'admin peut rendre débiteurs des formateurs déjà à jour.
> ⚠️ **Une bascule gratuit → payant est une action de masse.** Elle engage tous les
> formateurs à la fois, et elle n'est pas silencieuse : elle doit demander confirmation
> et porter une date d'effet, jamais s'appliquer à l'instant du clic. Elle relève des
> actions sensibles au sens de la convention de concurrence (`expectedUpdatedAt`).
> Statut : 📋 Rien n'existe. Aucun tarif en base, aucune route admin de tarification.
> Les briques sont là : `Setting` (clé/valeur/`updatedById`), `requireAdminSubRole`,
> `audit(tx, …)`.

**60. Tarification — qui peut quoi** — Le **Super-admin** fixe la grille tarifaire,
bascule gratuit ⇄ payant, et accorde des réductions. **Finances** accorde des réductions,
et rien d'autre : ni la grille, ni la bascule.
> Cohérent avec l'arbitrage 7, qui range « les abonnements » dans le périmètre Finances
> tout en réservant la configuration au Super-admin. La distinction porte donc sur la
> **nature du geste** : structurel (la grille, la bascule) contre commercial (la remise).
> Conséquence technique : deux niveaux de permission sur des routes voisines —
> `requireAdminSubRole('SUPER_ADMIN')` sur la grille et la bascule,
> `requireAdminSubRole('FINANCES', 'SUPER_ADMIN')` sur les remises. Le helper existe et
> c'est déjà le découpage retenu par les Lots 1-3.
> ⚠️ **Angle mort à surveiller** : le journal d'audit n'est lisible que par le
> Super-admin (arbitrage 7). Un admin Finances accorde donc des remises qu'il ne peut pas
> relire, et ne peut pas contrôler celles de ses collègues. Voir « Points non arbitrés ».
> Statut : 📋 Rien n'existe.

**61. La bascule prend effet à l'échéance de chacun** — Le passage de gratuit à payant
s'applique à chaque formateur **à son propre renouvellement**, pas à une date commune.
> Cohérent avec l'arbitrage 52 (les changements prennent effet à l'échéance) et avec
> l'interdit de rétroactivité de l'arbitrage 59 : **personne n'est jamais débité par
> surprise**, et il n'y a **aucun prorata à calculer**, nulle part.
> ⚠️ **Conséquence de trésorerie, à assumer** : la transition s'étale sur toute la durée
> d'un cycle. Un formateur entré en annuel gratuit ne paiera pas avant **douze mois**. La
> bascule décidée par le Super-admin n'est donc pas un levier de recette immédiat.
> Conséquence sur le job de renouvellement : c'est lui qui **résout le tarif en vigueur**
> à l'instant du renouvellement, puis le snapshote (arbitrage 57). Il doit rester
> idempotent, comme les sept jobs déjà câblés.
> Statut : 📋 Aucun job de renouvellement d'abonnement formateur n'existe.

**62. Trois canaux de réduction** — Les réductions prennent trois formes, toutes retenues :
- **campagne globale** — une remise datée valable pour tous ;
- **remise par formateur** — négociée, rattachée à un formateur et **motivée** ;
- **code promo** — saisi par le formateur à la souscription.
> Conséquence : les trois convergent vers le même résultat, le **montant consenti
> snapshoté sur l'abonnement** (arbitrage 57). Ce n'est donc pas trois mécanismes de
> facturation, mais trois façons de renseigner un même montant — la distinction vit dans
> l'origine et la traçabilité, pas dans le calcul.
> ⚠️ **Le cumul est le vrai sujet** : campagne + remise formateur + code promo peuvent se
> superposer, et rien ne dit encore si elles s'additionnent ou si la meilleure l'emporte.
> Tant que ce n'est pas tranché, un abonnement peut tomber à zéro sans que personne
> l'ait décidé. Voir « Points non arbitrés ».
> ⚠️ Le code promo est le seul des trois qui **ouvre une surface d'abus** : il demande
> compteurs d'usage, plage de validité et unicité par formateur. Les limites de débit
> existent déjà (`rate-limit.ts`, `RATE_LIMITS`), mais ne sont pas branchées.
> Statut : 📋 Rien n'existe.

---

## Arbitrages 63-70 — Signalements, tarification, sanctions

*63 à 66 tranchés le 3 août 2026 en construisant les trois derniers écrans admin ;
67 à 70 le même jour, en levant ce qui bloquait la suite.*

**63. Signalements — quatre surfaces, une seule sanction** — On peut signaler une
**ressource**, un **compte**, une **communauté**, un **message** de la messagerie, et un
**message de litige**. Quand la Modération retient un signalement, la seule sanction
disponible est le **retrait de la ressource du catalogue**.
> Conséquence de modélisation : un modèle `Report` **générique** (`targetType`,
> `targetId`), pas un signalement par surface — la Modération doit pouvoir répondre à
> « montre-moi tout ce qui est signalé ». `targetId` n'est volontairement pas une clé
> étrangère : les cibles vivent dans des tables différentes, et `MESSAGE` n'en a même pas
> encore (la messagerie n'est pas modélisée, arbitrage 33). Une cible introuvable est un
> **état affiché**, pas une erreur : le signalement documente ce qui s'est passé même si
> l'objet a disparu.
> Conséquence sur la sanction : retirer ≠ supprimer. `Course.status` passe à `archived`,
> la ressource sort du catalogue, et **les acheteurs gardent leur accès** — l'achat est
> définitif (arbitrage 2), un retrait ne rembourse personne. Rembourser reste le rôle
> d'un litige.
> ⚠️ Un signalement visant un **compte** s'instruit et se trace, mais la suspension n'a
> ni route ni règle arbitrée : l'écran le dit, plutôt que d'afficher un bouton qui
> échouerait. Voir « Points non arbitrés ».
> Statut : ✅ `Report` + `src/lib/reports.ts` + `/admin/signalements` (liste et détail),
> `POST /api/reports` (tout compte connecté, limité à 10/h) et
> `POST /api/admin/reports/{id}/resolve` (Modération et Super-admin). 6 tests.

**64. Un tarif de plateforme est daté** — `PlatformTariff` porte une cadence, un montant
et une fenêtre de validité. Poser un nouveau tarif **borne le précédent**, il ne le
réécrit jamais.
> Conséquence : on peut dire quel prix était en vigueur à n'importe quelle date, ce que
> l'arbitrage 59 exige. Un tarif à 0 est la gratuité de lancement (arbitrage 56) — pas un
> cas particulier dans le code, une ligne de tarif comme une autre.
> Une date d'effet dans le passé est refusée (`TARIFF_DATE_IN_PAST`).
> Statut : ✅ `src/lib/pricing.ts`, `POST /api/admin/pricing/tariffs` (Super-admin seul,
> décision 60), écran `/admin/parametres`. Testé.

**65. Le cumul des réductions — la plus favorable l'emporte** *(referme l'arbitrage 62)*
— Campagne, remise nominative et code promo **ne s'additionnent jamais**. On applique la
meilleure des trois.
> Raison : l'addition est le comportement qu'on ne peut pas rattraper. Trois remises de
> 40 % mènent l'abonnement à zéro sans que personne l'ait décidé — ni celui qui a lancé
> la campagne, ni celui qui a négocié, ni celui qui a créé le code.
> Conséquences : une réduction est un **montant** (arbitrage 57), donc deux réductions se
> comparent sans ambiguïté d'arrondi ; la réduction retenue est plafonnée au prix, une
> remise ne crée pas de créance ; un code promo épuisé (`maxUses`) ne s'applique plus,
> même dans sa fenêtre de validité ; une remise nominative **exige un motif**, elle
> contourne la grille.
> Statut : ✅ `quotePrice()` dans `pricing.ts`, 4 tests dont le cas « 2 000 + 3 500 ne
> font pas 5 500 ».

**66. `TrainerPlan` disparaît** *(conséquence de l'arbitrage 49)* — Les trois paliers
`STARTER`/`PRO`/`EXPERT` sont retirés du schéma au profit de
`TrainerProfile.subscriptionCadence` (`MONTHLY`/`YEARLY`).
> Ferme l'écart signalé en commentaire dans le wizard d'inscription formateur, qui notait
> que « les formules Mensuelle/Annuelle ne correspondent pas à `TrainerPlan` ».
> Le profil porte aussi `subscriptionPriceFcfa` et `subscriptionDiscountFcfa` — le
> montant consenti snapshoté (arbitrage 57) — et `pendingCadence`, la cadence souhaitée
> au prochain renouvellement (arbitrage 52).
> Statut : ✅ migration `20260803123616_reports_and_platform_pricing`. Les trois valeurs
> n'étaient lues nulle part : aucune logique n'en dépendait.

**67. Suspension d'un compte — deux niveaux** — La **Modération** met un compte en
**lecture seule** : il se connecte encore et garde ce qu'il a acheté, mais ne peut plus
publier, acheter ni écrire. Le **Super-admin** seul peut **couper la connexion**.
> Cohérent avec la gradation de la décision 7, et avec le membre banni d'une communauté
> (décision 40), qui suit déjà le patron « on écarte la parole, on ne retire pas l'accès ».
> Conséquence : **deux états distincts**, pas un booléen. `User.suspendedAt` existe déjà
> mais ne dit pas lequel des deux — il faut un niveau explicite, sinon une suspension
> douce et une exclusion totale deviennent indiscernables à la relecture.
> Conséquence sur la coupure de connexion : elle passe par un bump de
> `sessionsValidAfter` (le mécanisme d'invalidation ciblée du Lot 0 existe déjà). Elle
> retire aussi l'accès à des ressources **payées**, ce qui peut légitimement produire un
> litige : c'est pourquoi elle est réservée au Super-admin.
> Ferme le point non arbitré qui bloquait `/admin/utilisateurs` (aucune action) et la
> sanction des signalements visant un compte (décision 63).
> Statut : 📋 Rien n'existe : ni niveau sur `User`, ni route, ni écran.

**68. Impayé d'abonnement — les ressources sortent du catalogue** — Un formateur qui ne
paie pas passe en `PAST_DUE` puis `SUSPENDED`, l'écriture est bloquée, **et ses ressources
sont retirées du catalogue** : plus aucune vente nouvelle. Les acheteurs gardent leur
accès.
> ⚠️ **Conséquence assumée, signalée avant la décision** : retirer les ressources du
> catalogue supprime aussi la commission de 15 %, c'est-à-dire la seule recette qui
> restait sur ce formateur. La sanction est plus incitative, mais elle coupe la branche
> sur laquelle NkamVa était assise. Arbitré en connaissance de cause.
> Ce qui ne change pas : **la lecture n'est jamais coupée**. Les apprenants continuent
> d'accéder à ce qu'ils ont payé — un défaut de paiement du formateur ne doit pas se
> transformer en litiges de masse, et chaque litige ouvert réserve des fonds (décision 8).
> Statut : 📋 Aucun job de renouvellement, donc aucun impayé n'est encore détecté.

**69. Extension de stockage — par paliers de 50 Go** — Au-delà des 40 Go inclus
(décision 54), le stockage s'achète par tranches de 50 Go, facturées avec l'abonnement.
> Le pas est tranché, **le prix du palier ne l'est pas** — voir « Points non arbitrés ».
> Conséquence : le compteur d'octets par formateur devient nécessaire (recommandation 1
> de `docs/recommandations-modelisation.md`) ; il n'existe pas.
> Statut : 📋 Rien n'existe : ni compteur, ni palier, ni facturation.

**70. Cycle de vie de l'abonnement** — Le renouvellement facture à l'échéance de chacun,
applique la cadence en attente, détecte l'impayé et exécute la décision 68.
> Statut : ✅ **Implémenté le 3 août 2026** — `src/lib/subscriptions.ts` et trois jobs
> (`SUBSCRIPTION_RENEWAL` 01:00, `SUBSCRIPTION_SUSPENSION` 01:30,
> `SUBSCRIPTION_SUSPENSION_ALERT` 01:45). 11 tests.
>
> **`SubscriptionCharge` — une ligne par période facturée**, avec le montant figé
> (décision 57). L'unicité `(trainerId, periodStart)` **est** l'idempotence du job :
> rejouer un tour ne peut pas facturer deux fois, la contrainte le refuse en base plutôt
> que de compter sur la prudence du code.
>
> **Une période à zéro est `WAIVED`, pas `DUE`** : la cohorte de lancement (décision 56)
> ne tombe jamais en impayé, et aucun job ne s'acharne sur elle.
>
> **Le prix d'une période est celui du tarif en vigueur à son ouverture**, pas à
> l'exécution du job. Un job lancé en retard facture donc au bon tarif — c'est ce que
> l'interdit de rétroactivité (décision 59) impose, et ce que la décision 61 veut dire par
> « à l'échéance de chacun ».
>
> **Rattrapage des profils sans période** : les formateurs créés avant la facturation
> seraient restés invisibles du renouvellement — jamais facturés, et rien pour le
> signaler. Le job leur ouvre une première période et le **compte à part**
> (`initialized`) : c'est une anomalie qui se résorbe, pas un fonctionnement normal.
>
> **Le blocage en écriture mord vraiment** : `createCourse`, `publishCourse` et
> `presignCourseUpload` refusent en `SUBSCRIPTION_SUSPENDED` (422). Sans cela la
> décision 68 n'aurait été qu'un statut en base.
>
> **Le constat de règlement a son écran** depuis le 3 août 2026 :
> `/admin/abonnements` (Finances et Super-admin) liste les périodes, les plus anciennes
> d'abord, affiche la date de suspension à venir, et porte l'action « Constater » —
> `POST /api/admin/subscriptions/charges/{id}/settle`. C'est aujourd'hui **le seul geste
> qui lève un impayé**, exactement comme « constater le versement » l'est pour un retrait.
> Côté formateur, `/formateur/portefeuille` porte un bandeau dès qu'une période est due,
> avec la date à laquelle ses ressources sortiront du catalogue. Un impayé se découvrait
> jusque-là par une seule notification, qui pouvait passer inaperçue alors que la
> sanction, elle, retire les ressources du catalogue.
> ⚠️ **Rien n'encaisse automatiquement.** Aucun provider d'abonnement n'est branché : le
> règlement est constaté à la main. `subscriptionProvider` et `subscriptionProviderId`
> restent nuls.
> ⚠️ **Délai de grâce de 14 jours** (`SUBSCRIPTION_GRACE_DAYS`) : valeur retenue par
> défaut, **non arbitrée**. Voir « Points non arbitrés ».

---

## Arbitrages 71-86 — Invitations aux communautés

*Tranchés le 5 août 2026, avant toute implémentation. La spécification complète — modèle,
migration, parcours, refus, tests — est dans `docs/invitations.md` ; ce qui suit en est la
synthèse décisionnelle. Statut de tous : 📋 rien n'existe en base ni en code.*

**71. Trois natures, deux formes** — L'invitation ouvre une adhésion **offerte**, une
adhésion **payante**, ou l'entrée dans une **communauté privée**. Elle prend deux formes :
**nominative** (adressée à une adresse e-mail, usage unique) ou **lien partageable**
(plusieurs acceptations, plafonné et daté). La forme et la nature sont deux attributs
distincts (`kind`, `grant`), pas un seul.

**72. La gratuité est nominative, toujours** — Une adhésion offerte ne s'obtient que par
une invitation adressée et consommable une seule fois. Un lien gratuit qui circule est une
gratuité qu'on ne contrôle plus.

**73. Le nominatif n'est pas la gratuité** — La forme nominative porte aussi bien une
adhésion offerte qu'une adhésion payante. C'est une **conséquence** de l'arbitrage 74, pas
un choix de plus : si le nominatif impliquait la gratuité, une communauté privée — qui ne
s'entre qu'au nominatif — ne pourrait jamais encaisser un franc.

**74. Le lien partageable ne mène qu'au tarif, et jamais dans une communauté privée** —
Basculer une communauté en privé **révoque les liens partageables en circulation**, dans la
même transaction. Sans cela la fermeture serait cosmétique.

**75. Le formateur offre, le membre parraine** — Le formateur émet les deux formes et fixe
la durée offerte entre **1 et 3 mois** par invitation. Le membre actif n'émet que le lien
partageable payant. Offrir coûte de l'argent au formateur : la décision lui appartient.
> Conséquence : un membre d'une communauté privée ne peut émettre aucun lien.

**76. Le parrainage ne rapporte rien au parrain** — Ni mois offert, ni remise.
L'attribution est conservée (`CommunitySubscription.invitationId`) pour qu'une contrepartie
puisse s'y greffer plus tard sans reprise de modèle.
> Ajourné, pas refusé : toute contrepartie ouvre la question de son financement — part du
> formateur ou commission NkamVa —, donc les invariants financiers.

**77. L'adhésion offerte ne se reconduit pas** — Au terme, elle se ferme comme une
résiliation : accès résiduel conservé (arbitrage 48), aucune échéance ouverte, aucun
`PAST_DUE`. Facturer quelqu'un qui n'a jamais donné de moyen de paiement est une surprise,
pas une conversion.
> Conséquence de modélisation : `CommunitySubscription.provider` devient **nullable**, et un
> provider nul **est** la définition d'une adhésion offerte — il n'y a rien avec quoi la
> reconduire. C'est ce que lira `renewDueMemberships` pour la fermer.

**78. Une invitation payante ne se consomme qu'au paiement confirmé** — Ouvrir le tunnel ne
consomme rien ; l'usage est décompté dans la transaction du webhook. Un tunnel abandonné ne
brûle pas l'invitation. Symétrique de « rien n'est ouvert avant que le paiement soit
confirmé » (`src/lib/memberships.ts`).

**79. Une invitation ne blanchit rien** — Refusée à un compte banni de la communauté,
sanctionné, suspendu, et au formateur de la communauté lui-même. Une porte ouverte n'est
pas une décision annulée.

**80. L'adresse invitée est une donnée personnelle** — Inviter, c'est stocker l'adresse de
quelqu'un qui n'a rien demandé et n'a peut-être pas de compte. Rétention **90 jours après
l'état terminal**, purge planifiée, aucun usage marketing, aucune réutilisation, mention
dans la politique de confidentialité, présence dans l'export RGPD des deux côtés.

**81. La communauté privée sort de toutes les surfaces publiques** — Annuaire, recherche
transversale, panneau « Communauté » de la fiche formateur, et page `/communautes/[slug]`
qui répond **404** — un 403 révélerait son existence. Les membres déjà entrés restent
membres : passer en privé ferme la porte, ça n'expulse personne.

**82. Un jeton invalide ne révèle rien** — Inconnu, expiré, révoqué ou épuisé : même
message générique, sans nom de communauté ni de formateur, sans dire lequel des quatre cas
s'applique. Seule exception, imposée par l'arbitrage 73 : l'adresse discordante est
signalée, masquée (`j••••@exemple.com`).

**83. L'invitation ne crée pas de compte et ne vaut pas vérification d'adresse** — Le cas
majoritaire d'une invitation nominative est un invité **qui n'est pas encore sur NkamVa**.
Il s'inscrit et vérifie son adresse par l'OTP existant, comme tout le monde ; le lien
d'invitation ne remplace pas cette preuve. Un e-mail se transfère : si le jeton valait
`emailVerifiedAt`, un tiers pourrait poser un mot de passe sur une adresse qui n'est pas la
sienne. Le code arrive dans la même boîte que l'invitation — le coût ergonomique est d'un
écran.
> L'alternative (le jeton vaut vérification, pas d'OTP) — ce que « magic link » désigne
> d'ordinaire, et le mot qu'emploie l'inventaire du Lot 4 — a été pesée et écartée :
> l'invitation nominative garde de l'argent derrière elle (arbitrage 75), un lien transféré
> ne doit pas pouvoir le déplacer. Le mot « magic link » de l'inventaire est donc trompeur.
> Conséquence technique, plus large que les invitations : la chaîne
> `/auth/inscription` → `/auth/verifier-code` → `/auth/connexion` **perd aujourd'hui la
> destination**. Seul `login-form.tsx:36` lit un `callbackUrl`. Un paramètre `next`,
> validé comme chemin interne, doit la traverser.

**84. L'adresse invitée est imposée à l'inscription** — Arriver sur `/auth/inscription`
depuis une invitation nominative préremplit et verrouille le champ e-mail. Sans cela,
l'invité s'inscrit avec son adresse habituelle et récolte un `INVITATION_EMAIL_MISMATCH`
après avoir tout fait. Le verrouillage est ergonomique : **le refus reste côté serveur**.

**85. Une invitation en attente rejoint le compte qui vient de naître** — À la création
d'un compte, les invitations nominatives `PENDING` adressées à cette adresse lui sont
rattachées (notification in-app, carte sur `/accueil`). C'est une **lecture, pas une
acceptation** : adhérer, même gratuitement, reste un geste de l'invité.

**86. Le formateur ne voit qu'un statut d'invitation** — Jamais un statut de personne. Sa
liste ne dit pas si l'adresse invitée correspond à un compte existant : ce serait une sonde
d'énumération offerte à qui veut tester des adresses une par une.

---

## Arbitrages 87-89 — Cloisonnement de l'administration

*Tranchés le 6 août 2026. Statut : ✅ implémentés — `src/lib/roles.ts` porte la règle,
`tests/cloisonnement-admin.test.ts` la tient dans ses deux sens.*

**87. Un administrateur n'est qu'un administrateur** — Il n'achète aucune ressource,
n'adhère à aucune communauté, n'accepte aucune invitation et ne candidate pas au statut de
formateur. Ce n'est pas une simplification d'interface : ce sont les mêmes personnes qui
tranchent les litiges, valident les dossiers KYC et libèrent les retraits. Qui arbitre ne
doit pas pouvoir se favoriser — ni pouvoir en être soupçonné.
> La règle est posée dans les **services**, pas seulement dans le middleware ni dans les
> routes. Le middleware ne protège que les pages, et une garde de route ne protège que sa
> route : un acte économique atteint par un autre chemin passerait au travers.

**88. La frontière ne se franchit dans aucun sens** — On ne **promeut** pas un compte
existant : `createAdmin` refuse une adresse déjà connue, et un administrateur se crée
toujours sur une adresse dédiée. On ne **rétrograde** pas davantage : un administrateur qui
part voit son compte désactivé, et s'en crée un personnel s'il veut acheter. Sans quoi
l'interdiction de l'arbitrage 87 se contournerait en changeant de rôle le temps d'un achat.
> Le tout premier super-administrateur ne peut naître d'aucun geste ordinaire — seul un
> `SUPER_ADMIN` en crée un autre, et le sous-rôle est immuable. Il naît d'un script
> d'amorçage à usage unique, `scripts/bootstrap-super-admin.ts`, qui refuse de s'exécuter
> dès qu'un super-administrateur existe.

**89. Le formateur garde tous les privilèges de l'apprenant** — Il achète les ressources
des autres, adhère à leurs communautés, y prend la parole. Le conflit d'intérêts vise
l'arbitre, pas le concurrent : un formateur qui suit le travail d'un confrère ne décide
d'aucun litige et ne libère aucun retrait.
> La seule communauté qui lui reste fermée est **la sienne**, et pour un motif sans rapport
> avec celui-ci : s'y abonner lui ferait payer une commission sur son propre argent
> (`CANNOT_JOIN_OWN_COMMUNITY`, antérieur à ces arbitrages).

---

## Conventions techniques (Lot 0)

| Sujet | Décision | Statut réel |
|---|---|---|
| Base de données | PostgreSQL. Aucun contournement SQLite. Migrations Prisma versionnées, jamais `db:push` | ✅ **Recalé cette session** — `.env` pointe vers `postgresql://` (plus de SQLite). `prisma/migrations/` existe (`20260731140243_init`, `20260731140302_community_subscriptions_active_unique_index`), appliquées via `prisma migrate dev`/`deploy`, jamais `db:push` depuis. |
| Identifiants | `String @id @default(uuid())` | ✅ Conforme dans le schéma |
| Préfixe de routes | `/api` (pas de versionnage) | ✅ Conforme — toutes les routes existantes utilisent `/api/` |
| Enveloppe de réponse | `{ data, meta? }` en 2xx | ✅ Implémenté dans `api.ts` via `success(data, meta, status)` |
| Format d'erreur | `{ error: { code, message, details? } }`, code en SCREAMING_SNAKE_CASE | ✅ Implémenté dans `api.ts` via `error(code, message, status, details)`, plus `errorFromException()` ajouté cette session pour mutualiser le mapping par domaine (trainer-applications, disputes, payout-methods, payouts) |
| Codes HTTP | 400 validation · 401 non authentifié · 403 permission · 404 · 409 conflit/concurrence · 410 purgé · 422 règle métier · 429 rate limit | ✅ Conforme — utilisé de façon cohérente dans les 47 routes des Lots 1-3 |
| Pagination | `page` + `pageSize`, max 50 | ✅ Implémenté dans `catalog.ts`, `api.ts`, et repris dans les routes de listing des Lots 1-3 |
| Montants | FCFA en `Int`. EUR en `Decimal @db.Decimal(10,2)`. **Jamais de Float sur de la monnaie** | ✅ Schéma : `amountFcfa Int`, `amountEur Decimal? @db.Decimal(10, 2)`. Inchangé. |
| Audit | Écriture durable **dans la transaction** métier. Pas de fire-and-forget | ✅ `audit.ts` : `audit(tx, params)` prend une `PrismaTransaction`, utilisé dans toutes les transitions d'état des Lots 1-3. `auditStandalone(params)` pour les actions hors transaction (listes, consultations). |
| Email | Resend + react-email | ⚠️ Inchangé. `resend` installé, `email.ts` a `sendEmail()`. `react-email` **toujours pas installé** ; les emails des Lots 1-3 sont du HTML inline minimal, pas de templates react-email. |
| SMS | Non implémenté. Arbitrage 24 en email + in-app | ⚠️ Conforme pour l'absence de SMS, mais **la notification email de l'arbitrage 24 elle-même n'est pas envoyée non plus** (voir décision 24 ci-dessus). |
| Stockage objet | Cloudflare R2 (API S3-compatible). Pas de server access logs → journalisation uniquement applicative | ✅ `s3.ts` implémente R2 avec `@aws-sdk/client-s3`, plus `isS3Configured()` ajouté cette session pour le repli dev sans R2 dans `trainer-documents.ts`. Journalisation applicative via `TRAINER_DOCUMENT_VIEW` (audit). |
| Hachage mot de passe | argon2id (`@node-rs/argon2`) | ✅ Inchangé — `password.ts` utilise `@node-rs/argon2` |
| Auth | NextAuth v4. Invalidation ciblée via `User.sessionsValidAfter` | ✅ Inchangé côté `auth.ts`. `sessionsValidAfter` est désormais aussi bumpé par les transitions de rôle des Lots 1-3 (T2/T3/T6/T8 candidature). Le point de montage `/api/auth/[...nextauth]/route.ts` **n'existe toujours pas** — `isPublicRoute` gère déjà `/api/auth/*` par (méthode, préfixe) explicite, sans bypass, mais rien ne répond encore sur ce chemin. |
| Jobs | node-cron in-process, jobs idempotents | ✅ **Recalé cette session** — `node-cron` était installé mais rien n'était câblé. `src/instrumentation.ts` + `src/lib/jobs.ts` démarrent désormais les jobs (12 au 3 août 2026, dont les 3 de l'abonnement) (carence 72h, SLA 48h, auto-timeout litiges, cohérence wallet, alerte wallet négatif, purge documents 90j, nettoyage PendingAttachment), consolidés dans un seul fichier plutôt que `jobs-lot1/2/3.ts` séparés. Chaque job est idempotent au niveau des données (filtres sur statut/date) et journalise `SCHEDULED_JOB_COMPLETED`/`FAILED`. Testé (`tests/jobs.test.ts`). |
| Rate limiting | In-memory avec purge périodique | ✅ Inchangé — `rate-limit.ts`. Les nouvelles routes Lots 1-3 n'appliquent pas encore les limites `PAYOUT_METHOD_CREATE`/`PAYOUT_CREATE`/`MICRO_DEPOSIT_CONFIRM`/`DISPUTE_OPEN`/`DISPUTE_MESSAGE`/`UPLOAD_PRESIGN` déjà définies dans `RATE_LIMITS` (⚠️ constantes prêtes, non branchées sur les routes). |
| i18n | Aucun. Monolingue français | ⚠️ Inchangé — `next-intl` installé (template) mais non utilisé. |
| Toast | `sonner` | ❌ Inchangé — `layout.tsx` utilise `Toaster` de `@/components/ui/toaster`, pas `sonner`. |
| Temps réel | Polling TanStack Query — 8 s sur un fil, 15 s sur une liste. Pas de WebSocket | 📋 Inchangé. Aucun front avec polling n'est implémenté pour les Lots 1-3. |
| Cascades | `onDelete: Restrict` sur toutes les FK financières. Soft delete explicite pour les comptes | ✅ Inchangé — schéma non modifié cette session, toujours 25 occurrences de `onDelete: Restrict`. |
| Concurrence | Contrôle optimiste via `expectedUpdatedAt` sur les transitions d'état sensibles | ✅ **Recalé** — implémenté sur toutes les transitions admin sensibles (candidature approve/reject-documents/reject-final, litige ask-learner/resolve/reject, payout approve/reject), via `updateMany` gardé sur `updatedAt` égal à `expectedUpdatedAt`, 409 `STALE_*` sinon. ⚠️ Le helper `checkStale()` d'`api.ts` reste lui-même inutilisé — le même effet est obtenu par le pattern `updateMany` guard, pas par cette fonction précise. |
| ESLint | Exclusions `audit/`, `download/`, `tool-results/` | ⚠️ Inchangé — `eslint.config.mjs` ne contient toujours pas ces exclusions. |
| Vitest | Config avec alias `@/` | ✅ Inchangé, plus `fileParallelism: false` ajouté cette session (5 fichiers de test partagent la même base via `TRUNCATE`, l'exécution parallèle causait des violations de FK inter-fichiers). |
| Types NextAuth | Augmentation `Session`/`JWT` avec `role`, `adminRole`, `trainerId` | ❌ Inchangé — `src/types/next-auth.d.ts` toujours **MANQUANT**. |

---

## Invariants financiers

```
Wallet.reservedBalance      = SUM(FundReservation.reservedAmountFcfa WHERE status = ACTIVE)
Wallet.pendingPayoutBalance = SUM(Payout.amountFcfa WHERE status IN
                                  (PENDING, AUTO_APPROVED, IN_REVIEW, APPROVED))

solde retirable = balance - reservedBalance - pendingPayoutBalance

negativeSince non null  ⟺  solde retirable < 0
```

- `reservedBalance` est réservé aux litiges. Les payouts n'y écrivent jamais.
- `pendingPayoutBalance` est réservé aux retraits en vol. Les réservations de litige
  n'y écrivent jamais.
- Aucun état terminal d'un litige ne doit laisser une `FundReservation` en `ACTIVE`.
- Le crédit du wallet est idempotent : `updateMany` filtrant sur
  `providerStatus = PENDING`, déclenché **uniquement** depuis un handler webhook réel.
- En cas d'écart sur un solde, journaliser et alerter Finances — jamais d'auto-réparation
  silencieuse. La correction passe par un endpoint Super-admin dédié.

> Statut d'implémentation — **entièrement recalé cette session** :
> - **Schéma** : ✅ inchangé, les 3 champs + `negativeSince` sont sur `Wallet`.
> - **Crédit wallet idempotent** : ✅ `wallet.ts` (`creditWalletOnPurchase`), désormais
>   appelée **uniquement** depuis `/api/webhooks/stripe` et `/api/webhooks/cinetpay` —
>   plus de crédit direct à l'initiation de l'achat (`purchases.ts` simule en dev en
>   appelant réellement le handler de route webhook, pas en contournant
>   `creditWalletOnPurchase`).
> - **Maintenance de `reservedBalance`** : ✅ `disputes.ts` (transitions FR1-FR5).
> - **Maintenance de `pendingPayoutBalance`** : ✅ `payouts.ts` (transitions P1-P8).
> - **Job de cohérence** : ✅ `reconcileAllWallets` (`wallet-reconciliation.ts`), câblé
>   quotidien 03:30 UTC via `jobs.ts`.
> - **Endpoint de réconciliation** : ✅ `/api/admin/wallets/{walletId}/reconcile-
>   reserved-balance` et `.../reconcile-pending-payout-balance`, `SUPER_ADMIN`
>   uniquement, journalisent une ligne `WalletReconciliation` en cas d'écart (jamais
>   d'auto-réparation silencieuse — conforme).
> - **`negativeSince`** : ✅ synchronisé par `payouts.ts` (`markPayoutPaid`). Les autres
>   points de débit (remboursement litige) ne le synchronisent pas explicitement
>   (⚠️ écart : `completeRefund` dans `disputes.ts` ne recalcule pas `negativeSince`).

---

## Dépendances installées vs requises

| Package | Statut | Notes |
|---|---|---|
| `next` | ✅ v16.1.1 | |
| `react` | ✅ v19 | |
| `@prisma/client` | ✅ v6.11.1 | |
| `prisma` | ✅ v6.11.1 | |
| `next-auth` | ✅ v4.24.11 | |
| `zod` | ✅ v4.0.2 | |
| `@tanstack/react-query` | ✅ v5.82.0 | |
| `zustand` | ✅ v5.0.6 | |
| `@aws-sdk/client-s3` | ✅ | R2 |
| `@aws-sdk/s3-request-presigner` | ✅ | R2 présigné |
| `@node-rs/argon2` | ✅ | Hachage |
| `resend` | ✅ | Email |
| `node-cron` | ✅ | Jobs — **câblé** cette session via `src/instrumentation.ts` |
| `stripe` | ✅ **Installé cette session** (v22.4.0) | Utilisé par `lib/stripe.ts`, webhooks paiement + chargebacks, refunds Lot 2 |
| `dotenv` | ✅ | Chargement `.env` |
| `sonner` | ✅ | Toast (mais `layout.tsx` utilise toujours `Toaster` au lieu de `sonner`) |
| `vitest` | ✅ | Tests — 5 fichiers, 41 tests |
| `file-type` | ❌ Non installé, inchangé | Validation magic number toujours manuelle dans `s3.ts` (signatures hardcodées) |
| `react-email` | ❌ Non installé, inchangé | Emails Lots 1-3 en HTML inline minimal |

---

## Conséquences à garder en tête

- **Plafond KYC à 70 sans RIB vérifié** (40 PI + 10 ancienneté + 10 ventes + 10 litiges).
  Aucun premier retrait n'est donc auto-approuvable — cohérent avec l'arbitrage 25.
  > Statut : ✅ Vrai par construction dans `computeKycScore` (Mobile Money ne peut plus
  > créditer les 30 points RIB sans vraie API opérateur, cf. décision 22), et `requestPayout`
  > force de toute façon `IN_REVIEW` sur le premier retrait indépendamment du score.

- **Le critère « aucun litige ouvert » vaut 0** si le formateur n'a aucune vente
  `COMPLETED` : il ne récompense l'absence de litige que sur une activité réelle.
  > Statut : ✅ `computeKycScore` : `noOpenDispute = totalCompletedSales > 0 &&
  > openDisputesCount === 0`. Testé explicitement.

- **Les données d'identité** (pièce d'identité, RCCM) sont purgées 90 jours après la
  décision. La réouverture d'un dossier est impossible une fois les documents purgés.
  > Statut : ✅ `purgeExpiredTrainerDocuments` (`trainer-documents.ts`) câblé quotidien
  > 03:00 UTC. `reopenApplication` (T8) vérifie `documents.some(d => d.purgedAt)` →
  > `REOPEN_IMPOSSIBLE`.

---

## Points non arbitrés

- **Quota d'invitations offertes** (arbitrages 71-75) — `INVITATION_GIFT_MONTHLY_QUOTA = 20`
  par communauté et par 30 jours glissants. Valeur de sécurité, pas règle produit : faut-il
  un quota du tout, ou la commission perdue est-elle l'affaire du seul formateur ?
- **Plafond du lien de parrainage** (arbitrage 74) — 25 acceptations, 90 jours. Aucune
  justification produit : uniquement la maîtrise du dégât si le lien fuite.
- **Préavis avant la fin des mois offerts** (arbitrage 77) — 3 jours retenus, jamais
  discutés. Même question ouverte que le préavis de purge d'un replay (arbitrage 51).
- **Contrepartie du parrain** (arbitrage 76) — ajournée. Elle suppose de dire qui la
  finance : la part du formateur, ou la commission NkamVa.
- **Délai de grâce avant suspension** (arbitrage 70) — 14 jours retenus par défaut dans
  `SUBSCRIPTION_GRACE_DAYS`, jamais arbitrés. La valeur est nommée et isolée pour être
  discutée, pas découverte au fond d'une condition.
- **Provider d'abonnement** — le règlement est constaté à la main par Finances
  (`/admin/abonnements`). Aucun prélèvement automatique n'existe : reste à décider quel
  provider encaisse l'abonnement formateur, et si le constat manuel subsiste ensuite
  comme filet.
- **Retour au catalogue après régularisation** — constater un règlement remet le
  formateur en règle mais **ne republie rien** : ses ressources sont sorties du catalogue
  sur décision, elles y reviennent sur décision. Faut-il un geste dédié, ou le formateur
  les republie-t-il lui-même une par une ?
- **Prix du palier de 50 Go** (arbitrage 69) — le pas est tranché, le montant non. Reste
  aussi à dire si l'extension suit la cadence de l'abonnement du formateur (mensuelle ou
  annuelle) ou se facture à part.
- **Changement de rôle d'un compte** — la suspension est arbitrée (décision 67), pas le
  passage d'un rôle à un autre depuis l'administration. `/admin/utilisateurs` reste donc
  en lecture seule sur ce point.
- **Durée de la période de lancement** (arbitrage 56) — la gratuité est un tarif daté,
  mais aucune date de fin n'est fixée. Tant qu'elle ne l'est pas, la cohorte de lancement
  reste gratuite indéfiniment.
- **Cumul des réductions** (arbitrage 62) — campagne, remise formateur et code promo
  s'additionnent-ils, ou la plus favorable l'emporte-t-elle ? Faut-il un plancher (jamais
  en dessous de X FCFA) ? C'est le seul point qui peut mener un abonnement à zéro sans
  décision explicite.
- **Contrôle des remises accordées par Finances** (arbitrage 60) — le journal d'audit
  étant réservé au Super-admin (arbitrage 7), Finances ne peut relire ni ses remises ni
  celles de ses collègues. Faut-il une vue restreinte, limitée aux remises, ou est-ce
  volontaire ?
- **Sort du formateur qui ne paie pas à la bascule** (arbitrages 56 et 59) — `PAST_DUE`
  puis `SUSPENDED` (les valeurs existent déjà sur `TrainerSubscriptionStatus`), mais avec
  quelles conséquences exactes sur ses contenus déjà en ligne et sur ses apprenants ?
  Voir la recommandation 2 de `docs/recommandations-modelisation.md`.
- **Prix de l'extension de stockage** (arbitrage 54) — le pas de facturation (par 10 Go ?
  par 100 Go ?), le prix, et si l'extension suit la cadence de l'abonnement du formateur.
- **Prévenir avant la purge d'un replay** (arbitrage 51) — le membre reçoit-il une
  notification à l'approche des 24 mois ? Le formateur, lui, a intérêt à être prévenu :
  la purge lui rend du quota (arbitrage 54).
- Provider SMS (Twilio, Vonage, ou provider local africain) — voir arbitrage 24. Toujours
  non résolu.
- Provider bancaire pour le micro-virement IBAN — voir arbitrage 22c. Toujours non
  résolu ; les montants sont générés et stockés en clair côté NkamVa, aucun virement
  bancaire réel n'est déclenché.
- Disponibilité réelle des API de name lookup par opérateur mobile money — toujours non
  résolu, mais désormais correctement modélisé comme indisponible (`UNAVAILABLE`) plutôt
  que masqué par une comparaison locale trompeuse (voir décision 22).

~~Format exact du payload de notification CinetPay~~ — **résolu cette session** :
vérifié contre `docs.cinetpay.com` (checkout/notification, /hmac, /verification).
POST en `application/x-www-form-urlencoded`, champ `cpm_trans_id`, en-tête `X-TOKEN`
(HMAC-SHA256 sur une concaténation ordonnée de champs, clé `secret_key` distincte de
l'`apikey`) — contrairement à ce qu'affirmait la spec Lot 0 d'origine (« pas de HMAC »).
Voir `src/app/api/webhooks/cinetpay/route.ts` pour le détail et les sources.

---

## Résumé de l'état d'implémentation

*Recalé le 31 juillet 2026 contre la branche `lein/prisma-schema-lot0-audit-ac819f`.*

| Lot | Services (`src/lib`) | Routes API | Pages front | Tests | Jobs |
|---|---|---|---|---|---|
| **Lot 0** (Socle) | 15 fichiers (api, audit, auth, db, email, notification, password, rate-limit, s3, stripe, wallet, types, utils, jobs, pending-attachments) | 0/5 (auth register/otp/verify-otp/reset-password, health) + 2 webhooks (stripe, cinetpay) ✅ | Template initial uniquement | — | 7/7 câblés (node-cron + instrumentation.ts) |
| **Lot 1** (Validation) | 2/2 (`trainer-applications.ts`, `trainer-documents.ts`) ✅ | 13/13 ✅ | 0/3 | 7/7 ✅ | inclus ci-dessus (purge 90j) |
| **Lot 2** (Litiges) | 2/2 (`disputes.ts`, `manual-refund-tasks.ts`) ✅ | 15/15 ✅ | 0 | 7/7 ✅ | inclus ci-dessus (auto-timeout, cohérence wallet, alerte négatif) |
| **Lot 3** (KYC/Payouts) | 5 (`kyc.ts`, `payout-methods.ts`, `payouts.ts`, `wallet-reconciliation.ts`, `name-match.ts`) ✅ | 23/23 ✅ (+4 le 3 août : présignature des documents d'entreprise, consultation Finances, `mark-failed`, `reopen`) | 6 ✅ (2 formateur, 4 admin : moyens de paiement et retraits, liste + détail) | 23 ✅ + 9 sur la comparaison de noms | inclus ci-dessus (carence, SLA) |
| **Lot 4** (Parcours cœur) | 4/4 ✅ (inchangé) | 15/15 ✅ (inchangé) | 0/6 | 10/10 ✅ (+2 cette session : webhook rejoué, payload malformé) | — |
| **Total** | 35 fichiers lib (+`upload.ts`, `name-match.ts`, `audit-review.ts`, `users-review.ts`, `reports.ts`, `pricing.ts`, `analytics.ts`, `subscriptions.ts`) | 73 routes Lots 1-4 + 2 webhooks | 2 pages formateur + 12 pages admin — **toute la navigation admin a sa page** | **211/211 tests passent** (`npx vitest run`, Postgres réel, mesuré le 3 août 2026 — la ligne « 41 » de la version précédente datait du 31 juillet) | 12 jobs planifiés câblés |

Écarts encore ouverts (non couverts par les 3 corrections + régénération de cette
session) : voir ⚠️/❌ ci-dessus — notamment la notification de résolution de litige au
formateur (décision 16), la notification de modification de RIB (décision 24), la
distinction INDIVIDUAL/BUSINESS dans la vérification (décision 28), les rate limits non
branchées sur les nouvelles routes, `checkStale()` inutilisé, et les pages frontend des
Lots 1-3 (aucune n'a été demandée dans cette session).
