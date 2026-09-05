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
> 5 Mo (✅). Le 8 août 2026, le genre `archive` ajoute **zip et rar** (2 Go), ce qui
> lève l'écart principal : sans lui, `kit`, `notion` et `tableur` — trois des cinq
> formats proposés à la saisie — n'avaient aucun type de fichier acceptable et
> restaient impubliables. **xlsx et docx** restent hors liste (⚠️ écart résiduel ;
> l'un et l'autre sont des conteneurs zip, un formateur peut donc les livrer
> compressés). Contenu des archives **non inspecté** : l'extension fait foi
> (décision du 8 août 2026, voir `confirmCourseUpload`) — un zip authentique peut
> renfermer n'importe quoi, et un fichier illisible se signale à l'usage. Le quota par plan SaaS n'est toujours pas implémenté (📋) — sa valeur
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
> ⚠️ ~~**Écart temporaire, toujours actif**~~ — **refermé le 13 août 2026, par les deux
> bouts.** La notification à l'ancienne adresse e-mail **est envoyée** (`createPayoutMethod`
> appelle `sendEmail` sur `trainerEmailSnapshot`) ; celle à l'ancien **numéro** ne le sera
> jamais — non par manque de provider, mais **par décision** : voir l'arbitrage 100.
> Statut : ✅ Archive l'ancien, crée le nouveau, relance la carence de 72 h
> (`createPayoutMethod`, transaction atomique) et alerte l'ancienne adresse e-mail avec un
> lien de signalement. `trainerPhoneSnapshot` reste capturé sur chaque `PayoutMethod` pour
> documenter le dossier, pas pour notifier.

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
>
> ⚠️ **Amendé le 12 août 2026 — le retour au catalogue n'est plus « sur décision ».**
> La rédaction précédente posait que les ressources « sont sorties du catalogue sur
> décision, elles y reviennent sur décision », ce qui laissait un formateur ayant réglé
> son impayé attendre le geste d'un administrateur pour retrouver sa vitrine.
> **Le règlement republie désormais automatiquement**, par les trois chemins qui soldent
> une période : le prélèvement sur solde, le paiement par carte ou mobile money, et le
> constat manuel de Finances. Voir l'arbitrage 12 de `docs/abonnement-formateur.md`.
>
> Cela a exigé de **distinguer une sortie subie d'un archivage volontaire**, ce que le
> code ne savait pas faire : la suspension écrivait `status = 'archived'`, exactement la
> même valeur que celle qu'un formateur pose en rangeant lui-même une ressource. Sans
> marqueur, republier « ce qui a été retiré » aurait ressuscité ce qu'il avait choisi de
> retirer de la vente. D'où `Course.catalogSuspendedAt`.
> Statut : ✅ **Implémenté le 12 août 2026** — `catalog-suspension.ts`, migration
> `20260812151635_subscription_payment_and_catalog_suspension`, tests dans
> `tests/subscription-payment.test.ts`.

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
> ⚠️ ~~**Rien n'encaisse automatiquement.**~~ **Levé le 12 août 2026.** Le formateur
> dispose désormais de trois voies de règlement : le **prélèvement sur son solde NkamVa**
> — opt-in, retenté chaque nuit pendant le délai de grâce —, le **paiement par carte ou
> mobile money** par la même porte que les achats, et le constat manuel de Finances, qui
> subsiste. Le fournisseur reste absent du modèle : `subscriptionProvider` et
> `subscriptionProviderId` restent nuls, le règlement en ligne s'inscrivant sur
> `SubscriptionPayment`. Voir `docs/abonnement-formateur.md`.
>
> **Délai de grâce de 14 jours** (`SUBSCRIPTION_GRACE_DAYS`) : ~~valeur retenue par
> défaut, non arbitrée~~ — **arbitré le 12 août 2026** (arbitrage 14 de
> `docs/abonnement-formateur.md`). Avec le rejeu nocturne du prélèvement, ce n'est plus
> seulement un sursis : c'est la fenêtre pendant laquelle les ventes du formateur peuvent
> solder son échéance sans qu'il ait rien à faire.
>
> **Ce que le formateur peut enfin faire lui-même** (12 août 2026) : trois champs
> modélisés n'étaient écrits par personne — `pendingCadence` (décision 52),
> `subscriptionCanceledAt`, et la valeur `CANCELED` de l'enum. L'écran
> `/formateur/abonnement` leur donne un auteur : changer de cadence, activer le
> prélèvement, résilier, régler, et consulter ses périodes.

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
part voit son compte **fermé** — `suspendedAt` posé, `role` et `adminRole` conservés — et
s'en crée un personnel s'il veut acheter. Sans quoi l'interdiction de l'arbitrage 87 se
contournerait en changeant de rôle le temps d'un achat.
> `revokeAdmin` faisait exactement cela : il écrivait `role: 'LEARNER', adminRole: null`.
> C'était la porte de sortie de l'arbitrage 87 — se faire retirer ses droits suffisait à
> redevenir acheteur, en laissant derrière soi un journal d'audit signé d'un administrateur
> qui n'existait plus. Remplacé par `deactivateAdmin`, doublé de `reactivateAdmin` : une
> fermeture sans réouverture condamnerait un compte sur un clic, et couperait son journal
> en deux identités pour une même personne.
> `suspendedAt` suffit à couper l'accès — `authorize` refuse la connexion et le callback
> `session` annule les sessions ouvertes. Le bump de `sessionsValidAfter` s'y ajoute pour le
> **middleware**, qui ne lit que le JWT et ne consulte pas la base.
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

**90. On ne part pas en laissant quelqu'un en plan** — `requestDeletion` refuse tant qu'une
situation reste ouverte au nom de la personne. Six motifs, dont le premier n'est pas de la
même nature que les autres :

| Refus | Ce qu'il protège |
|---|---|
| `ADMIN_ACCOUNT` | La redevabilité. Un administrateur ne s'efface pas lui-même (arbitrage 88) : il s'adresse à un super-admin, qui **ferme** son compte. |
| `WALLET_NOT_EMPTY` | L'argent du formateur, qu'il doit se faire verser avant. |
| `PAYOUT_IN_FLIGHT` | Le retrait déjà débité mais pas encore versé — le solde peut être nul alors que l'argent bouge encore. |
| `PUBLISHED_COURSES` | L'acheteur d'une ressource dont l'auteur disparaîtrait. |
| `ACTIVE_COMMUNITY` | Les membres qui paient encore : les prévenir est au formateur, pas au système. |
| `OPEN_DISPUTE` | L'autre partie et l'administrateur qui instruit. Vaut **aussi côté acheteur** : on peut être en litige sans être formateur. |

> L'effacement est une **anonymisation**, pas une suppression de ligne : les écritures
> comptables survivent à la personne (`onDelete: Restrict`). C'est justement pour cela que
> les refus ci-dessus existent — une écriture qui survit à quelqu'un d'introuvable n'aide ni
> le litige en cours, ni le membre qui paie, ni le comptable.
>
> Le renouvellement des adhésions ignore les comptes effacés, et **eux seuls** : pendant les
> 30 jours de grâce la personne est encore cliente, elle a payé sa période et peut annuler
> son départ. C'est `deletedAt` qui met fin au lien, pas `deletionRequestedAt`.

---

## Arbitrages 91-107 — Conformité, coût du direct, tarification des paliers

*Tranchés le 13 août 2026, après une instruction qui est allée chercher les chiffres et les
textes à l'extérieur du dépôt. Deux d'entre eux (91, 92) ne répondent à aucune question
posée dans les documents précédents : ils sont nés de la recherche, pas de l'inventaire.
Statut de tous, sauf mention contraire : 📋 rien n'existe en base ni en code.*

**91. La conformité « données personnelles » est un lot de travail, pas une page de
confidentialité** — La loi camerounaise n° 2024/017 du 23 décembre 2024 impose un registre
des traitements, la notification des violations à l'autorité **et** aux personnes
concernées, et une **autorisation préalable de l'APDP pour tout transfert hors du
Cameroun**. Sa période de mise en conformité s'est achevée le 23 juin 2026 — elle est donc
déjà derrière nous. NkamVa transfère hors du pays vers cinq sous-traitants : la base
(Supabase, Francfort), les fichiers (Cloudflare R2), les courriels (Resend), et les
paiements (Stripe, PawaPay). L'un d'eux porte des **pièces d'identité** et des coordonnées
bancaires.
> Conséquence, dans l'ordre : (1) constituer le registre des traitements — il est déjà écrit
> à 80 %, éparpillé dans `docs/` et dans les commentaires du schéma ; (2) déposer la demande
> d'autorisation de transfert, en listant les cinq sous-traitants et les catégories de
> données de chacun ; (3) écrire la procédure de notification de violation, avec un
> destinataire nommé ; (4) faire relire par un conseil camerounais — le texte est trop
> récent pour que la pratique de l'autorité soit connue.
> À faire valoir dans le dossier, parce que c'est là-dessus qu'il se juge : la purge des
> pièces d'identité à 90 jours (`purgeExpiredTrainerDocuments`), celle des adresses invitées
> à 90 jours (arbitrage 80), l'export RGPD et l'effacement de compte **existent déjà et sont
> testés**. Les mécanismes précèdent la demande.
> ⚠️ Sanctions annoncées : jusqu'à 100 000 000 FCFA et des peines privatives de liberté.
> Statut : 📋 aucun effet sur le code. C'est du document et de la procédure.

**92. Le portefeuille formateur n'est pas un compte de paiement — il faut que ce soit vrai
en droit, pas seulement dans notre tête** — En zone CEMAC, fournir des services de paiement
suppose un agrément (établissement de crédit, EMF, ou établissement de paiement — ce dernier
exigeant une SA OHADA et **500 millions de FCFA de capital libéré**). La réforme en cours
crée au **1er janvier 2027** une catégorie d'opérateurs visant explicitement l'**acquisition
et l'agrégation de paiement**, avec agrément COBAC et cantonnement des fonds de clients. Une
place de marché qui encaisse pour le compte de vendeurs tiers y tombe naturellement, et
notre `Wallet` — qui encaisse, retient (`reservedBalance`), débite et reverse — ressemble
davantage à un compte de paiement qu'à un compte fournisseur.
> **Décision : viser la qualification, pas l'agrément.** NkamVa vend **en nom propre** —
> l'apprenant achète à NkamVa, le formateur est un fournisseur rémunéré sur facture. Le
> portefeuille devient un compte de dettes fournisseurs, ce qui n'est pas un service de
> paiement. `Invoice` et `InvoiceCounter` portent déjà la moitié du chemin.
> Deux conditions, sans lesquelles la décision ne vaut rien : réécrire les CGU en ce sens, et
> **faire instruire la conséquence fiscale** — la TVA porterait alors sur le prix entier et
> non sur la commission.
> Repli si cette voie est écartée : le **bac à sable réglementaire** prévu par la réforme,
> douze mois renouvelables une fois, sous plafonds. L'agrément à 500 M FCFA n'est pas une
> option à ce stade.
> ⚠️ Ce qui ne change pas : les invariants financiers, le partage 85/15 et la commission
> restent identiques. C'est la **qualification juridique** du même flux qui bouge, pas le
> flux.
> Statut : 📋 nul si la qualification change ; considérable sinon (cantonnement, comptes
> séparés, reporting).

**93. La salle n'a pas de jauge, la scène a un plafond** *(précise les arbitrages 31 et 46)*
— Neuf publieurs vidéo simultanés au maximum ; le reste de la salle est en audio et en
réception. Le plafond est **technique et global**, il ne se règle pas par session et ne
s'affiche jamais comme une jauge de places.
> Raison, chiffrée : la bande descendante croît avec le **carré** du nombre de participants
> quand chacun reçoit tous les autres. À 30 personnes, une séance de 2 h coûte environ
> 270 FCFA par participant-heure, soit près de la moitié d'un abonnement communautaire
> mensuel à 5 000 FCFA — pour une seule séance. Scène plafonnée, on retombe à ~60 FCFA par
> participant-heure, et le coût redevient linéaire.
> Conséquence : l'arbitrage 46 tient entier — personne n'est jamais refusé pour cause de
> capacité, et l'arbitrage 31 aussi — tout le monde peut toujours parler. La **file numérotée
> des mains levées (arbitrage 36) devient le mécanisme qui fait tourner les places sur la
> scène**, ce qu'elle était déjà censée être.
> Statut : ✅ **Implémenté le 13 août 2026** — `LiveParticipant.onStage` (migration
> `20260813012319_stage_capacity`), attribution sérialisée par un verrou sur la ligne de
> séance, places rendues à la coupure comme au départ. Les deux causes se disent
> séparément à l'écran — « micro coupé par l'animateur » contre « scène complète ». La
> console affiche l'occupation et désactive « Donner la parole » quand il n'y a plus de
> place, plutôt que d'échouer après le clic. 4 tests.

**94. Les replays s'enregistrent vers le stockage objet** *(complète les arbitrages 38, 51 et
54)* — L'egress LiveKit écrit directement dans le seau, en une définition unique
(800 kbit/s à 1,5 Mbit/s) plus une variante audio seule pour les connexions faibles.
L'adaptateur Mux est **conservé** — il est écrit et propre — comme option d'une offre
ultérieure, pas comme chemin par défaut.
> Raison n° 1, le prix : un replay de 2 h coûte ~3 700 FCFA sur 24 mois chez Mux (encodage
> du direct à 0,025 $/min, stockage à 0,0024 $/min/mois, remises « froid » comprises) contre
> ~290 FCFA en stockage objet, la sortie de données y étant gratuite. Avec un live
> hebdomadaire, l'écart annuel est d'environ 175 000 FCFA **par communauté**.
> Raison n° 2, moins visible et plus grave : le quota de l'arbitrage 54 se compte en
> **octets**, Mux facture à la **minute**. Tant que les replays passent par Mux, le quota ne
> mesure pas ce que le formateur coûte, et l'arbitrage 54 est inapplicable à son poste le
> plus lourd.
> Repère à annoncer aux formateurs : 40 Go, c'est environ **trente séances de 2 h**, quota
> partagé avec les ressources téléversées.
> Statut : ✅ **Implémenté le 13 août 2026** — `REPLAY_RECORDER=MUX` est désormais le seul
> chemin vers Mux ; par défaut l'egress écrit dans le seau en 720p/1 200 kbit/s, doublé
> d'une variante audio seule (`Replay.audioS3Key`, migration
> `20260813013508_replay_audio_variant`) que le lecteur propose quand elle existe.
> **Défaut corrigé au passage** : la purge vidait la ligne sans supprimer l'objet — le
> quota était rendu au formateur, la facture de stockage jamais.

**95. Prix du palier de stockage — 3 000 FCFA par mois, 30 000 par an**
*(ferme le point non arbitré de l'arbitrage 69)* — Par tranche de 50 Go, facturée **à la
cadence de l'abonnement du formateur**, avec le même geste commercial que lui : deux mois
offerts sur l'annuel.
> Raison : le stockage objet coûte 0,015 $ par Go et par mois, sortie comprise — un palier
> de 50 Go nous coûte donc ~450 FCFA par mois. Les plateformes comparables incluent 10 Go sur
> leur entrée de gamme et 200 Go sur une formule à plusieurs centaines de dollars : nos 40 Go
> inclus sont généreux, c'est le palier qui doit rapporter.
> Une cadence propre au palier créerait un **second calendrier de facturation** pour rien ; le
> renouvellement sait déjà résoudre un tarif daté.
> ⚠️ **Aujourd'hui l'extension est gratuite, silencieusement** : sans `PlatformTariff` de
> genre `STORAGE_TIER`, `storageTierPriceFcfa()` renvoie 0 — et 0 est la bonne réponse au
> sens du code, pas une erreur. Le montant se pose sans livraison.
> Statut : ✅ **Posé le 13 août 2026** — 3 000 / 30 000 FCFA en base, via
> `scripts/tarifs.ts`. L'achat de palier par le formateur et sa facturation avec
> l'abonnement existaient déjà.

**96. La gratuité de lancement se termine le 31 décembre 2026, avec 60 jours de préavis**
*(ferme le point non arbitré de l'arbitrage 56)* — Le tarif à 0 reçoit une borne
(`validUntil`), et la bascule est annoncée deux mois avant.
> Le préavis est long **parce que la bascule prend effet à l'échéance de chacun**
> (arbitrage 61) : un formateur entré en annuel gratuit ne paiera pas avant douze mois, et la
> recette n'arrive de toute façon pas d'un coup. Prévenir tard n'accélère rien et surprend
> tout le monde.
> La date se change en posant un nouveau tarif, **sans livraison** (arbitrage 59) : ce n'est
> pas une constante de code, c'est une ligne administrée. Elle est ici pour qu'une date
> existe, pas pour qu'elle soit intouchable.
> ⚠️ **Borner ne suffit pas — constaté en implémentant, le 13 août 2026.** Poser un
> `validUntil` sur le tarif à 0 sans lui donner de successeur est **sans effet** :
> `getCurrentTariff` ne trouve alors plus rien et `quotePrice` retient 0 quand la grille est
> muette. L'abonnement resterait gratuit, simplement sans ligne pour l'expliquer. La bascule
> n'existe donc que si un **tarif payant lui succède**, et c'est en le posant que le
> précédent se borne. Le montant de ce tarif payant n'est arbitré nulle part — voir « Points
> non arbitrés ».
> Statut : 📋 `scripts/tarifs.ts` pose la bascule sur `--abonnement <mensuel> <annuel>` et la
> refuse sans montant. La notification à 60 jours reste à écrire.

**97. Le change se règle chez le fournisseur, pas dans la colonne des taux** — NkamVa
demande à PawaPay un **règlement en devise locale** sur les marchés où elle reverse, et
n'ouvre les reversements hors zone franc que là où cette réponse est acquise.
> Raison : le même `unitsPerXaf` encaisse et reverse — aucune marge sur le taux ne couvre le
> spread, le calcul du 12 août l'a montré (1 % de spread ≈ 12 % de la commission). PawaPay
> propose bien un règlement *local*, vers un compte bancaire de la même juridiction que
> l'encaissement, distinct du règlement transfrontalier ; devises et frais ne sont pas
> publiés et se négocient, comme les taux.
> Tant que ce n'est pas acquis, la position honnête reste celle d'aujourd'hui : **vendre
> partout, reverser en zone franc**. Si un marché devient significatif sans règlement local,
> alors seulement scinder `fx_rates` en taux d'encaissement et taux de reversement — un seul
> chiffre ne peut pas être juste dans les deux sens.
> SLE reste fermé : 7,8 % d'écart entre agrégateurs, aucune source de référence.
> Statut : 📋 démarche commerciale ; le code ne bouge que dans l'hypothèse de la scission.

**98. Le name lookup passera par MTN MoMo** *(rouvre la couche (a) de l'arbitrage 22)* —
L'API MTN MoMo expose `GET /collection/v1_0/accountholder/msisdn/{numéro}/basicuserinfo`,
qui retourne le nom du titulaire. C'est le seul chemin public existant : il devient la
première implémentation de `fetchOperatorAccountName()`. Partout ailleurs, la revue manuelle
Finances reste la règle.
> Conséquence : un compte marchand MTN, distinct de PawaPay, avec ses propres identifiants de
> production délivrés après KYC. **Avant d'ouvrir ce chantier, demander à PawaPay s'ils
> exposent le nom du payeur** — ils répondent par courriel, et une réponse positive
> économiserait toute l'intégration.
> Ce qui ne change pas : `AUTO_VERIFIED` n'est atteignable que sur un `MATCH` renvoyé par une
> vraie API, et la comparaison locale reste interdite (arbitrage 22).
> Statut : 📋 `name-match.ts` est écrit et testé ; seul le point d'entrée externe manque.

**99. Le micro-virement IBAN est abandonné** *(ferme la couche (c) de l'arbitrage 22)* — La
vérification d'un compte bancaire se fait **sur pièce** : RIB fourni, comparaison de nom en
revue manuelle Finances. Aucun micro-virement n'est émis.
> Raison : aucun équivalent des agrégateurs bancaires (type Plaid) n'existe en zone CEMAC ;
> émettre de vrais micro-virements suppose une banque et une opération manuelle par dossier.
> Décider de ne pas le faire vaut mieux qu'un écart permanent qui donne l'illusion d'une
> vérification.
> Conséquence sur le code : le chemin `MICRO_DEPOSIT` de `payout-methods.ts` **reste en
> place** mais n'est plus proposé à l'écran. On ne supprime pas un chemin testé pour une
> décision qui peut se rouvrir le jour où une banque partenaire arrive.
> Statut : ✅ **Retiré le 13 août 2026** de l'écran d'instruction. Le service et ses tests
> restent ; l'écran explique la vérification sur pièce, et les dossiers dont les montants
> ont déjà été tirés peuvent encore se terminer.

**100. Il n'y aura pas de SMS** *(ferme l'arbitrage 24 et la ligne « SMS » des conventions)* —
L'e-mail et la notification in-app **sont** le canal d'alerte de la plateforme, y compris
pour le changement de moyen de paiement. Aucun provider SMS ne sera intégré.
> Raison, opérationnelle plus que tarifaire : Orange Cameroun vend par paquets prépayés **qui
> expirent** (22 FCFA l'unité à 1 000, 16 FCFA à 50 000), plafonnés à 100 000 FCFA d'achat par
> jour et par SIM, à 5 messages par seconde ; MTN valide les identifiants d'expéditeur à la
> main. Pour quelques alertes de changement de RIB par mois, l'exploitation coûte plus que le
> risque couvert — et un canal qu'on oublie de recharger est un canal qui ment.
> Conséquence : `trainerPhoneSnapshot` reste capturé sur `PayoutMethod` (il documente le
> dossier), mais **plus rien n'est censé le lire pour notifier**. L'écart signalé depuis le
> Lot 3 cesse d'en être un.
> Statut : ✅ conforme par décision — la notification à l'ancienne adresse e-mail existe déjà
> (`createPayoutMethod`).

**101. Le SLA de revue est de 48 heures calendaires** *(corrige l'arbitrage 23)* — Le mot
« ouvrées » disparaît.
> Raison : le code, les écrans et l'alerte SLA sont calendaires depuis l'origine. Modéliser un
> calendrier ouvré camerounais pour un délai indicatif ajouterait une table, des jours fériés
> à maintenir, et zéro garantie supplémentaire au formateur.
> Statut : ✅ conforme par décision — `PAYOUT_REVIEW_SLA_HOURS = 48`, définition unique dans
> `payout-methods.ts`.

**102. Quota d'invitations et plafond du lien sont des réglages, pas des règles produit**
*(ferme deux points non arbitrés des arbitrages 71-75)* — Les 20 invitations offertes par
communauté et par 30 jours glissants, comme les 25 acceptations / 90 jours du lien
partageable, sont des **limites de dégât** portées par `Setting` et modifiables par le
Super-admin. Elles ne sont pas annoncées comme une caractéristique de l'offre.
> Raison : les reclasser évite d'avoir à les arbitrer. Le vrai garde-fou du lien est ailleurs
> — il ne mène qu'au tarif plein (arbitrage 74) et se révoque.
> Statut : ✅ **Implémenté le 13 août 2026** — `invitations.gift_monthly_quota` et
> `invitations.share_link_max_uses` vivent dans `Setting`, réglables depuis
> `/admin/parametres`. Le plafond est **figé sur le lien** à l'émission : relire le réglage
> à chaque acceptation ferait varier la capacité d'un lien déjà en circulation.
> Corrigé au passage : une clé du registre sans ligne en base n'apparaissait pas à l'écran
> et refusait d'être enregistrée — un réglage câblé mais introuvable.

**103. Une seule politique de préavis — J-7 puis J-1, et J-30 quand prévenir sert à
télécharger** *(ferme le point non arbitré des arbitrages 77 et 51)* — Tout ce qui **se
termine** prévient à J-7 puis à J-1 : fin d'une adhésion offerte, fin d'adhésion, échéance
d'abonnement. Le préavis long, à J-30, est réservé au cas où l'avertissement appelle un
**geste coûteux** : la purge d'un replay prévenue au formateur, qui doit avoir le temps d'en
récupérer une copie de plusieurs gigaoctets.
> Raison : trois valeurs choisies au hasard (3 jours ici, autre chose là) se contrediront à
> l'écran et ne se retiendront pas. Mais uniformiser jusqu'à l'absurde serait pire — le
> `REPLAY_PURGE_ALERT` prévient déjà à 30 jours, et c'est **délibéré** : sept jours ne
> suffisent pas à télécharger deux ans d'enregistrements sur une connexion camerounaise.
> La règle est donc : un seul rythme pour les fins d'accès, une exception nommée et
> justifiée pour les téléchargements.
> Conséquence : le membre et le formateur ne reçoivent pas la même information sur la même
> purge — l'un perd un accès (J-7/J-1), l'autre **récupère du quota** (J-30, arbitrage 54).
> Statut : ✅ **Implémenté le 13 août 2026** — `src/lib/notices.ts`, deux jobs
> (`GIFT_MEMBERSHIP_ENDING_NOTICE`, `TARIFF_SWITCH_NOTICE`). **Défaut trouvé en
> implémentant** : le préavis de purge partait *chaque jour pendant trente jours*, la
> fenêtre étant ouverte de maintenant à J-30. Le seuil franchi est désormais inscrit au
> journal et relu avant d'écrire — un job rejoué ne prévient pas deux fois. 6 tests.

**104. Si le parrainage rapporte un jour, il sera financé par la commission** *(précise
l'arbitrage 76, qui reste ajourné)* — Une éventuelle contrepartie du parrain se prendra sur
la part NkamVa, **jamais sur les 85 % du formateur**.
> Raison : le formateur n'a pas décidé du parrainage. Lui faire payer une acquisition qu'il
> n'a pas choisie casserait l'invariant du partage, et rendrait sa marge dépendante des
> gestes d'un tiers.
> Statut : 📋 rien à faire tant que la contrepartie n'existe pas. `CommunitySubscription.
> invitationId` conserve déjà l'attribution.

**105. Le registre des remises est distinct du journal d'audit** *(ferme le point non arbitré
de l'arbitrage 60)* — Un écran « Remises » liste les `PlatformDiscount`, leur auteur et leur
motif, et il est ouvert à **Finances**. Le journal d'audit, lui, reste au seul Super-admin
(arbitrage 7).
> Raison : un registre métier n'est pas un journal d'audit. Le premier se consulte pour
> travailler — vérifier ce qu'on a accordé, retrouver une remise négociée —, le second pour
> contrôler. L'arbitrage 7 ne parle que du second, et l'angle mort signalé à l'arbitrage 60
> venait de les avoir confondus.
> Statut : ✅ **Implémenté le 13 août 2026** — `/admin/remises`, ouvert à Finances et au
> Super-admin, en consultation seule : auteur, motif, fenêtre de validité et compteur
> d'usage. La Modération y est refusée, comme partout dans les finances.

**106. On ne change pas le rôle d'un compte depuis l'administration** *(précise les
arbitrages 67 et 88)* — Les seules transitions restent : créer, désactiver, réactiver.
`/admin/utilisateurs` demeure en consultation, augmentée des deux niveaux de sanction de la
décision 67.
> Raison : c'est déjà la logique de l'arbitrage 88 — la frontière administrateur / non-
> administrateur ne se franchit dans aucun sens. L'écrire évite qu'un contributeur pressé
> prenne l'absence de bouton pour un oubli et l'ajoute.
> Le passage apprenant → formateur existe et n'est pas concerné : il se fait par la
> candidature et le paiement d'activation, pas par un geste d'administrateur.
> Statut : ✅ conforme par décision — rien à écrire, quelque chose à ne pas écrire.
> **Corrigé le 13 août 2026, trouvé en vérifiant** : la route de sanction exigeait
> `SUPER_ADMIN` pour *tout*, ce qui rendait la moitié de la décision 67 inatteignable — la
> Modération instruisait un signalement visant un compte sans pouvoir en tirer la seule
> conséquence qui lui revienne. Elle peut désormais mettre en lecture seule depuis le
> dossier ; l'exclusion reste au Super-admin, et le service le refusait déjà.

**107. UTC en base, fuseau déclaré sur la séance** *(retient la recommandation 9 de
`docs/recommandations-modelisation.md`)* — `LiveSession` porte un fuseau IANA en plus de son
horodatage ; l'heure s'affiche dans le fuseau du lecteur.
> Raison : un produit camerounais avec une diaspora aura des séances à cheval sur plusieurs
> fuseaux dès la première année. Le champ coûte une migration aujourd'hui et un rattrapage de
> données demain.
> Statut : ✅ **Implémenté le 13 août 2026** — `LiveSession.timeZone` (migration
> `20260813032040_live_session_time_zone`), renseigné par le navigateur de l'animateur et
> ignoré s'il est invalide. L'agenda n'affiche « soit 18 h 00 à Douala » que si le fuseau
> du lecteur diffère : le rappeler à tout le monde serait du bruit.

**108. Une communauté ouverte rend son animateur visible** *(corrige une asymétrie entre
l'arbitrage 81 et l'annuaire)* — Un formateur entre dans `/formateurs` s'il est approuvé, non
suspendu, et qu'il a **une ressource publiée _ou_ une communauté `active` + `PUBLIC`**. Sa
page d'accueil formateur lui dit laquelle des deux lui manque.
> Raison : une communauté publique ne demandait rien de son animateur, l'annuaire exigeait une
> ressource publiée. Les deux règles étaient défendables séparément et incohérentes ensemble :
> la fiche communauté annonçait le formateur, le nommait, et portait deux liens vers sa fiche —
> son nom et « Voir le formateur » — qui répondaient **404**, à trois centimètres du bouton
> d'adhésion payant. Le visiteur qui cherchait à savoir qui anime avant de payer tombait sur
> une page introuvable.
> Le sens de la correction — élargir plutôt que retirer les liens — suit la règle telle qu'elle
> était déjà énoncée : « seuls les formateurs ayant quelque chose à montrer apparaissent ». Une
> communauté ouverte **est** quelque chose à montrer.
> Statut : ✅ **Implémenté le 13 août 2026** — `PUBLIC_TRAINER_WHERE` (`lib/trainers.ts`) est
> devenu la source unique de la règle : l'annuaire, la fiche et la recherche transversale en
> tenaient chacun une copie, et rien ne les gardait d'accord. Fiche allégée quand il n'y a pas
> encore de ressource — la section renvoie vers la communauté au lieu de laisser un vide qui
> ressemble à une page cassée —, et la carte d'annuaire annonce « 1 communauté » plutôt qu'un
> « 0 ressource » qui décrit ce qui manque.
> Le pendant côté formateur : `getTrainerVisibility` et l'encart de `/formateur`. La règle
> existait et ne se disait nulle part — un formateur invisible n'avait aucun moyen d'apprendre
> pourquoi, l'hypothèse naturelle étant un profil incomplet, qui n'y est pour rien. L'encart
> nomme le geste manquant (publier, ou **ouvrir** une communauté restée privée) et disparaît
> dès que la visibilité est acquise. Un test compare les deux lectures sur sept scénarios :
> un préavis qui diverge de la règle qui cache est pire que pas de préavis.

---

## Arbitrages 108-117 — Mobile first

> Rendus le 14 août 2026, à l'ouverture du chantier mobile first. Diagnostic
> complet dans `docs/mobile-first-analyse.md`, backlog dans
> `docs/mobile-first-implementation.md`.
>
> **Ces dix décisions ont été prises par défaut, faute d'arbitrage explicite du
> propriétaire, pour ne pas bloquer le chantier.** Chacune est réversible ; celles
> marquées 🔁 changent significativement le volume de travail si on les inverse.

**108. Lecture retenue de « mobile first »** — UX + produit (lectures B et C de
l'analyse) : le téléphone est la maquette de référence, et l'app se comporte comme
une app (barre d'onglets basse, feuilles glissantes, historique respecté). Le CSS
mobile first (lecture A) suit mécaniquement, il n'est pas un objectif en soi.
Raison : le public paie en mobile money, sur Android d'entrée de gamme, en 3G
facturée au mégaoctet. La lecture A seule serait cosmétique pour lui.

**109. 🔁 L'administration est hors périmètre** — Les 24 écrans `/admin` ne sont
pas repris pour le mobile. Ils héritent seulement de ce qui est gratuit : échelle
de seuils, `dvh`, chaîne d'image. `DataTable` garde son défilement horizontal.
Raison : usage bureau, et l'audit ne relève **aucun débordement** sur ces écrans —
ils sont utilisables, simplement pas optimisés. Les inclure ajouterait un lot XL
pour un gain nul.
> Conséquence : les tâches L3-23 à L3-25 du backlog sont retirées.

**110. Échelle de points de rupture : celle de Tailwind** — `sm` 640 · `md` 768 ·
`lg` 1024 · `xl` 1280. Aucun seuil arbitraire nouveau. Table de migration des sept
seuils actuels :

| Seuil actuel | Devient | Ce qu'il commande |
|---|---|---|
| 640 | `sm` | rythme vertical de la vitrine |
| 767 / 768 | `md` | plancher de 16 px sur les champs |
| 820 | `lg` | bascule de navigation |
| 860 / 861 | `lg` | barre latérale admin, blocage de défilement |
| 900 | `lg` | colonne de filtres du catalogue |

Raison : 331 usages Tailwind contre 36 arbitraires. On ramène les 36 vers les 331.
Conséquence assumée : sous 1024 px, **les tablettes reçoivent la disposition
tactile** — c'est le sens du chantier, pas un effet de bord.

**111. Barre d'onglets basse — 4 destinations, plus « Plus »**

| Espace | Entrées |
|---|---|
| Visiteur | Accueil · Catalogue · Communautés · Se connecter |
| Apprenant | Accueil · Mes ressources · Catalogue · Mes communautés · Plus |
| Formateur | Accueil · Espace formateur · Mes ressources · Catalogue · Plus |

Cinq emplacements maximum, le cinquième ouvrant une feuille glissante. Un
formateur reste un apprenant : sa barre ajoute, elle ne remplace pas — c'est la
règle déjà tenue par `TRAINER_NAV`.

**112. Duplication DOM : on mutualise la source, pas les rendus** — Une liste
d'entrées unique, deux rendus (barre haute bureau, barre basse mobile). Pas de
refonte des coquilles. Raison : le risque réel est la divergence des données, pas
le coût du double rendu.

**113. Budgets chiffrés**

| Sujet | Budget |
|---|---|
| Appareil de référence | Android entrée de gamme, 360–375 px de large |
| Réseau de référence | 3G rapide — 1,6 Mb/s descendant, 300 ms de latence |
| Transfert au premier rendu | ≤ 300 Ko hors polices |
| Images par écran de liste | ≤ 120 Ko cumulés |
| Une couverture servie sur mobile | ≤ 60 Ko |
| LCP | ≤ 3 s sur le profil ci-dessus |
| Chrome vertical | ≤ 22 % de la hauteur visible (≤ 178 px à 812 px) |

**Point de départ mesuré** (build de production du 14 août 2026, avant tout
travail) : **1 080 Ko de JavaScript client gzippé** répartis sur 93 fragments,
dont un **socle commun de 157 Ko chargé sur chaque page**. Le budget de 300 Ko au
premier rendu est donc déjà consommé à plus de la moitié par le socle avant
d'afficher quoi que ce soit — il est tenable, mais il ne laisse pas de marge pour
une dépendance lourde supplémentaire. C'est aussi ce qui justifie l'arbitrage 109
(ne pas ouvrir l'admin) et le ménage des dépendances mortes du lot 1.

**114. L'orientation n'est plus verrouillée** — `orientation: "portrait-primary"`
est retiré du manifeste au profit de `"any"`. Raison : quatre lecteurs vidéo se
battaient contre le verrou dans la PWA installée, et le plein écran paysage est le
geste naturel pour regarder un cours. Les écrans supportent la rotation — l'audit
ne relève aucun débordement.

**115. Le tunnel de paiement déroge à la sobriété réseau** — Sur la seule
confirmation d'achat : vérification immédiate au retour de focus (dérogation
explicite au `refetchOnWindowFocus: false` global), et plafond de sondage porté de
**120 s à 300 s**. Raison : une saisie de code USSD sur réseau lent dépasse
couramment deux minutes ; l'utilisateur revenait sur un sondage arrêté.

**116. Plancher typographique** — Aucun texte sous **13 px**. Tout texte porteur
d'une information nécessaire à l'action : **14 px** minimum. Le corps reste à
15 px. Les tailles à 11 et 12 px de la vitrine sont donc à reprendre.

**117. Le fil d'Ariane cède la place au retour sur mobile** — Sous `md`, un retour
explicite vers le parent remplace le fil complet, qui réapparaît au-dessus.
Raison : en `flex flex-wrap` il s'enroulait sur deux à trois lignes, au prix du
budget vertical de l'arbitrage 113.

### Les onze règles d'expérience — critères opposables

Toute livraison du chantier mobile se juge sur cette liste. Elle est vérifiée par
`scripts/smoke-mobile.ts` (lot 4).

1. Toute couche superposée est une entrée d'historique — le retour la ferme, il ne
   quitte jamais l'écran.
2. Toute action donne un retour en moins de 100 ms, et **jamais** un retour
   contradictoire (succès annoncé pendant que la liste montre l'ancien état).
3. Toute destination principale est atteignable en un appui, dans le tiers bas.
4. Toute cible tactile fait au moins 44 × 44 px de zone utile.
5. Tout champ déclare son clavier : `type`, `inputMode`, `autoComplete`,
   `enterKeyHint`.
6. À la soumission, le focus va au premier champ en défaut.
7. Aucun texte porteur de sens sous 13 px (arbitrage 116).
8. Le chrome reste sous le plafond de l'arbitrage 113.
9. Le contenu est lisible avant que le JavaScript ait fini — aucune animation
   d'apparition ne retient du contenu.
10. Aucune page authentifiée n'est mise en cache — le téléphone est partagé.
11. Rien ne consomme de données sans demande, **sauf** sur le tunnel de paiement
    (arbitrage 115).

---

## Arbitrages 118-125 — Suites de l'audit fonctionnel du 1er septembre 2026

> Rendus le 4 septembre 2026, après l'audit fonctionnel du MVP mené sur
> `develop` tel que servi par staging. Contrairement aux arbitrages 108-117,
> **ceux-ci ont été tranchés explicitement par le propriétaire**.
>
> L'audit relève douze constats. Neuf sont confirmés par le code ; un — la
> disparition d'un live planifié de l'espace formateur — n'a aucune cause
> identifiable en lecture et attend une reproduction.

**118. La durée d'une vidéo est mesurée, pas saisie** — Elle est lue sur l'objet
téléversé à la confirmation du téléversement, par lectures d'intervalles, au même
endroit et pour la même raison que sa taille. Le champ disparaît du formulaire.
Une lecture en échec laisse la durée vide et **ne bloque pas la publication**.
Le **nombre de sessions annoncé disparaît purement et simplement** : une ressource
est un fichier unique, le mode école est hors périmètre (arbitrage 4), et rien ne
peut confronter ce nombre au contenu. Raison : l'audit a déposé un fichier « une
session » sous une annonce « deux sessions » et rien ne l'a arrêté — ce qu'aucun
contrôle ne peut vérifier ne doit pas être demandé.

**119. Cinq événements partent par e-mail, sous deux catégories** — Nouveau
message, achat abouti, invitation émise, invitation acceptée, adhésion à une
communauté. L'achat et l'adhésion préviennent **les deux parties** : l'annonce de
vente au formateur est la seule façon d'apprendre qu'on a vendu sans surveiller un
écran. Le **transactionnel ne se coupe pas** (un reçu est une preuve), le
**relationnel se coupe d'un seul interrupteur**, et une invitation part vers une
adresse sans compte, donc sans préférence possible. Raison : cinq interrupteurs
dans le profil seraient pires que le problème.

**120. On associe une ressource à une communauté *ouverte*, pas *visible*** —
Précision de l'arbitrage 81 : `status` dit que la communauté vit, `visibility`
dit qu'on peut la trouver. Le contrôle porte sur `status` seul — un formateur qui
passe sa communauté en privé continue d'y inclure des ressources. La règle est
bornée à l'instant de l'association, la bascule vendue → incluse étant à sens
unique (arbitrage 53).

**121. La progression est une position de lecture réelle, sur tous les formats
rendables** — Une seconde pour une vidéo, **une page pour un document**, quitte à
embarquer un visualiseur. Les archives, qui ne se rendent pas en ligne, portent un
marqueur ouvert / terminé posé par l'apprenant. Raison : quatre des cinq
ressources de staging sont des PDF, et un PDF servi dans une balise vidéo
n'affiche rien et ne mesure rien — c'est ce que l'auditeur a rencontré.
> Arbitrage pris **contre la recommandation technique**, qui proposait le
> marqueur binaire pour tout ce qui n'est pas vidéo afin d'épargner le budget
> mobile. Le propriétaire a maintenu la position de lecture. D'où l'arbitrage 122.

**122. Le budget de transfert se lit par route** — Une dépendance lourde reste
interdite dans le socle commun et sur toute route de parcours. Elle est admise sur
une route terminale à trois conditions cumulatives : import dynamique, hors
parcours d'acquisition, poids mesuré et consigné. Raison : sans cette lecture,
l'arbitrage 121 était inapplicable ; avec elle, le budget de 300 Ko continue de
valoir intact sur l'accueil, le catalogue, la fiche et le tunnel d'achat.

**123. Un lien partageable affiche un compteur d'usages, pas un statut** — Une
invitation nominative est à usage unique et garde son statut binaire. Un lien
partageable est multi-usage par conception — 25 acceptations sur 90 jours
glissants (arbitrage 102) — et n'a donc **pas d'état « accepté »** : il affiche
`n / maximum` et ne devient terminal qu'épuisé, expiré ou révoqué. Précise
l'arbitrage 86, qui dit *quoi* montrer sans dire *comment* le lire. Raison : la
pastille binaire le laissait « en attente » pour toujours alors que des membres
étaient entrés, ce que le formateur lit comme une panne.

**124. Une action interrompue par l'authentification reprend après** — Acheter,
adhérer, accepter une invitation, ouvrir une ressource : la destination voyage
dans `callbackUrl` et **traverse toute la chaîne** inscription → vérification par
code → connexion, validée par un garde-fou unique et partagé. Généralise ce que
l'arbitrage 84 faisait déjà pour la seule invitation, dont l'adresse est imposée
et verrouillée à l'inscription : l'état d'une action y traverse déjà la création
de compte, il n'y avait aucune raison qu'il le fasse pour un seul parcours.

**125. Le formateur a un historique de ses ventes, ligne à ligne** — Pour chaque
vente : ce qui a été vendu, la date, le brut, la commission retenue, le net, le
statut. Valeurs figées sur l'achat, lues à leur source. Raison : un solde global
ne dit pas d'où vient l'argent, et un formateur qui voit 1 700 FCFA arriver sur
une vente à 2 000 doit retrouver les 300 retenus sans les calculer lui-même.

### Deux règles réaffirmées, non renumérotées

- **Le sondage de la messagerie** — 8 s sur un fil, 15 s sur une liste — était
  **déjà décidé** et figure au §4.2 du cahier. Il n'est implémenté que sur la
  confirmation d'achat. Ce n'est donc pas un arbitrage nouveau mais un **écart
  d'implémentation**, corrigé au titre de la règle d'expérience 2 (jamais de
  retour contradictoire).
- **Le rappel avant une séance reste ajourné.** L'audit l'énumère parmi les
  notifications attendues ; personne n'a constaté son absence comme un défaut.
  Il reste une hypothèse tant que le premier live réel n'a pas eu lieu.

### Ce que ces décisions laissent ouvert

| Point | Bloque | Ce qu'il faut décider |
|---|---|---|
| Ressource incluse dans une communauté qui ferme | Arbitrage 120 | La bascule étant à sens unique, reste-t-elle servie aux membres entrés, disparaît-elle, ou le formateur récupère-t-il un droit de republication ? |
| Portée de `resourcesEnabled` | Arbitrage 120 | Un salon de ressources éteint sur une communauté active empêche-t-il l'association ? |
| Cause de la disparition d'un live planifié | — | Aucune cause trouvée en lecture de code ; à reproduire sur compte connecté |

---

## Arbitrages 126-130 — La messagerie unifiée

> Rendus le 4 septembre 2026, à la demande du propriétaire. Spécification
> complète : voir l'artefact « Messagerie unifiée ».
>
> Point de départ : un apprenant jongle entre l'écran des messages et la page de
> chaque communauté pour suivre ce qui s'y dit. Les deux surfaces sont pourtant
> de même nature — des gens qui se parlent — et rien ne justifiait qu'elles
> vivent à deux endroits.

**126. Le fil de discussion d'une communauté devient un groupe de la
messagerie** — Flux plat, comme une conversation privée, l'auteur nommé sur
chaque message. La liste des conversations mêle groupes et fils privés.
Livraison **en deux temps** : d'abord la messagerie accueille les groupes et le
fil historique reste lisible en place, ensuite seulement l'historique bascule.
Raison : le second temps est irréversible — des réponses aplaties ne se
ré-imbriquent pas, l'ordre chronologique ne dit plus qui répondait à qui — et
rien ne justifie de migrer des données avant d'avoir vu l'écran vivre.
> Écarté : garder le forum imbriqué derrière une entrée unique. La gêne de
> navigation disparaissait, la gêne de forme restait.

**127. « Salon » est retiré du produit, « groupe » le remplace** — Le mot
désignait **trois** choses : la communauté vue comme un lieu (« salon public »,
qui est en fait sa visibilité), une des cinq fonctionnalités activables
(« salons ouverts »), et la discussion d'une séance live. Désormais :
**communauté** pour l'entité payante, **groupe** pour le fil collectif dans la
messagerie, « ce qui est ouvert » pour les interrupteurs, « la discussion de la
séance » pour le live. Raison : un écran qui fusionne deux surfaces ne peut pas
garder un mot qui en désigne trois — chaque phrase demanderait deux lectures.

**128. L'annonce est un message épinglé qui notifie** — Le salon « Annonces »
disparaît, et `Community.broadcastEnabled` avec lui : il ne reste que quatre
interrupteurs. Annoncer devient un geste dans le groupe — le formateur marque
son message, ce qui l'épingle en tête **et** déclenche la notification à tous
les membres (F12.5). Raison : la demande était « l'annonce se gère au niveau des
notifications », mais la liste des notifications est plafonnée à cinquante
lignes — une annonce importante en sortirait au bout de cinquante événements,
alors qu'elle reste aujourd'hui dans le salon aussi longtemps que la communauté.
Le message épinglé garde la relecture, la notification garde l'alerte.

**129. L'ancien membre garde le groupe en lecture seule** — Il le lit, il n'y
écrit plus. Aligne le groupe sur l'arbitrage 39, qui laisse déjà le fil privé
lisible après la fin de l'adhésion. Raison : c'est le seul changement de droit
de ce chantier, et il est imposé par la fusion elle-même — dans une liste
unique, un ancien membre aurait vu son fil ouvert et un groupe verrouillé côte à
côte, sans que rien n'explique la différence.

**130. Une seule liste, trois filtres, une recherche** — Ordre : le groupe de sa
propre communauté épinglé d'office pour le formateur qui l'anime, puis les
conversations épinglées à la main par date d'épinglage, puis tout le reste par
dernier message. Filtres **Toutes / Non lues / Groupes**. Recherche sur le nom
de la personne, le nom du groupe **et le corps des messages**.
> Pas de filtre « Privées » : il se déduit de « Groupes » et n'ajouterait qu'un
> onglet à balayer. La recherche couvre le corps des messages parce que chercher
> un mot dit dans une conversation dont on a oublié le nom est le cas courant —
> s'en tenir aux titres ferait un annuaire, pas une recherche.

### Ce que la bascule a coûté, et qui était su

> Les deux temps sont livrés — 4 septembre 2026. La migration
> `bascule_historique_groupes` a versé les billets dans les messages, réécrit
> les signalements qui les visaient, puis vidé les deux tables.

Deux pertes, décidées et non subies :

- **L'imbrication.** Une réponse est devenue un message posté à sa propre date.
  Elle suit son billet, mais rien ne dit plus qu'elle lui répondait. C'est le
  prix du passage d'un forum à un flux, et la raison du découpage en deux temps.
- **L'épingle d'une discussion.** Le nouveau modèle n'épingle que les annonces.
  Un sujet épinglé par un membre ne pouvait pas en devenir une — annoncer est un
  geste de formateur — il a donc perdu son épingle. Les annonces ont gardé la
  leur, puisque c'est ce que le marqueur veut dire.

Ce qui a été conservé : l'auteur, la date, le texte, le retrait avec la trace de
qui l'a retiré, et les signalements ouverts, réécrits vers le message
correspondant.

Un effet de bord traité au passage : `refreshCommunityActivity` comptait les
billets pour alimenter « messages / jour » de la fiche publique. Elle compte
désormais les messages **du groupe** — les fils privés n'y entrent pas, ils ne
regardent personne. Sans ce changement, toute communauté aurait affiché zéro le
lendemain de la bascule.

### Ce que ces décisions laissent ouvert

| Point | Ce qu'il faut décider |
|---|---|
| Le formateur dans les groupes qu'il a rejoints comme apprenant | Rien ne s'y oppose, mais son nom y apparaît sans distinction de rôle |
| `Community.messagesPerDay` | La colonne existe et n'est lue par personne. Un groupe actif est le premier endroit où un plafond servirait |
| Cadence de sondage d'un groupe | Le §4.2 fixe 8 s sur un fil et 15 s sur une liste, pensés pour du 1 à 1. Un groupe n'a pas le même débit, et la règle 11 du §10.2 interdit de consommer des données sans demande. **À trancher au lot 4**, qui attend donc ce chantier |

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
| SMS | **Aucun provider, par décision** — arbitrage 100 du 13 août 2026. L'e-mail et la notification in-app sont le canal d'alerte, y compris pour l'arbitrage 24 | ✅ Conforme par décision. La notification à l'ancienne adresse e-mail est bien envoyée (`createPayoutMethod`, `sendEmail` sur `trainerEmailSnapshot`) ; `trainerPhoneSnapshot` reste capturé pour documenter le dossier, plus rien ne doit le lire pour notifier. |
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

*Liste recalée le 13 août 2026. Les arbitrages 91-107 en ont fermé onze ; ce qui reste
tient en cinq lignes, dont trois dépendent d'un tiers.*

**Encore ouverts**

- **Conséquence fiscale de la vente en nom propre** (arbitrage 92) — si NkamVa vend en son
  nom, la TVA porte-t-elle sur le prix entier plutôt que sur la commission, et à quel taux ?
  C'est la seule inconnue qui peut rendre l'arbitrage 92 plus cher que le problème qu'il
  résout. À faire instruire avant de réécrire les CGU.
- **Montant de l'abonnement payant** (arbitrages 59, 64, 96) — jamais arbitré, et personne ne
  l'avait remarqué parce que la gratuité le rendait sans objet. Il le redevient dès qu'on
  veut borner la gratuité : sans successeur, la borne ne change rien. Deux montants à dire,
  mensuel et annuel. *(La base de développement porte 9 000 FCFA en mensuel et **rien** en
  annuel — un formateur qui choisit l'annuel ne paie donc rien. Valeur de travail, pas
  décision.)*
- **Réponse de PawaPay sur deux points** (arbitrages 97 et 98) — le règlement en devise
  locale par marché, et l'existence éventuelle d'un nom de payeur dans les rappels. Les deux
  se demandent par courriel ; la seconde réponse, si elle est positive, rend l'intégration
  MTN de l'arbitrage 98 inutile.
- **Redirection de l'espace visiteur** — un connecté navigue librement dans `(public)`.
  **Ajourné volontairement** : deux arbitrages doivent précéder toute ligne de code, le
  périmètre (`/recherche` n'a pas de jumeau connecté et deviendrait inaccessible) et
  l'échappatoire « voir la fiche publique » pour le formateur qui inspecte sa vitrine.
- **Rappel avant une séance** (recommandation 8) — ajourné : une préférence utilisateur pour
  un produit qui n'a pas encore tenu son premier live est une hypothèse, pas un besoin. La
  notification in-app suffira jusqu'à ce que quelqu'un se plaigne.
- **Inscription à une séance, distincte de la présence** — ajourné pour la même raison, et
  l'arbitrage 46 a retiré la seule chose qui l'aurait rendue nécessaire : la jauge.

**Fermés depuis la version précédente de cette liste**

- ~~Quota d'invitations offertes~~ · ~~Plafond du lien de parrainage~~ — **arbitrage 102** :
  ce sont des réglages de sécurité portés par `Setting`, pas des règles produit.
- ~~Préavis avant la fin des mois offerts~~ · ~~Prévenir avant la purge d'un replay~~ —
  **arbitrage 103** : J-7 puis J-1 pour toute fin d'accès, J-30 quand prévenir sert à
  télécharger (purge d'un replay, côté formateur — déjà conforme).
- ~~Contrepartie du parrain~~ — **arbitrage 104** : toujours ajournée, mais si elle arrive
  elle se finance sur la commission NkamVa, jamais sur la part du formateur.
- ~~Délai de grâce avant suspension~~ — **arbitré le 12 août 2026** (arbitrage 14 de
  `docs/abonnement-formateur.md`) : 14 jours, avec rejeu nocturne du prélèvement.
- ~~Provider d'abonnement~~ — **tranché le 12 août 2026.** Aucun fournisseur d'abonnement
  récurrent n'est branché, et il n'en faut pas : le prélèvement porte sur le **solde NkamVa**
  du formateur, et le règlement manuel passe par Stripe et PawaPay, la même porte que les
  achats. Le constat de Finances subsiste comme filet. Voir `docs/abonnement-formateur.md`.
- ~~Retour au catalogue après régularisation~~ — **tranché le 12 août 2026** : le règlement
  republie automatiquement (arbitrage 12). La décision 68 est amendée en conséquence.
- ~~Prix du palier de 50 Go~~ · ~~Prix de l'extension de stockage~~ — **arbitrage 95** :
  3 000 FCFA/mois ou 30 000 FCFA/an par tranche, à la cadence de l'abonnement.
- ~~Durée de la période de lancement~~ — **arbitrage 96** : borne au 31 décembre 2026,
  préavis de 60 jours, date modifiable sans livraison.
- ~~Changement de rôle d'un compte~~ — **arbitrage 106** : interdit, dans les deux sens.
- ~~Contrôle des remises accordées par Finances~~ — **arbitrage 105** : un registre des
  remises ouvert à Finances, distinct du journal d'audit.
- ~~Cumul des réductions~~ — **tranché le 3 août 2026** par l'arbitrage 65 : la plus
  favorable l'emporte, jamais l'addition.
- ~~Sort du formateur qui ne paie pas à la bascule~~ — **tranché** par la décision 68
  (sortie du catalogue, lecture jamais coupée) et l'arbitrage 12 de
  `docs/abonnement-formateur.md` (le règlement republie).
- ~~Provider SMS~~ — **arbitrage 100** : il n'y en aura pas. L'e-mail et l'in-app sont le
  canal d'alerte.
- ~~Provider bancaire pour le micro-virement IBAN~~ — **arbitrage 99** : abandonné,
  vérification sur pièce.
- ~~Disponibilité des API de name lookup~~ — **arbitrage 98** : MTN MoMo expose
  `basicuserinfo`, c'est le chemin retenu. Ailleurs, revue manuelle.

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
