# Décisions produit — NkamVa

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
> cette session). Le quota par plan SaaS n'est toujours pas implémenté (📋).

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
> Statut : ✅ `requireAdminSubRole('FINANCES', 'SUPER_ADMIN')` protège désormais toutes
> les routes `/api/admin/payout-methods/*` et `/api/admin/payouts/*`.

**21. Nom légal vérifié** — À l'approbation du document `ID_CARD`, l'admin Modération
saisit et confirme le champ `verifiedLegalName`. Finances lit ce champ pour la
comparaison et n'a **jamais** accès à l'image de la pièce d'identité.
Si `verifiedLegalName` est absent, la vérification du RIB est impossible :
409 `IDENTITY_NAME_MISSING`.
> Note d'implémentation : le champ vit sur `TrainerProfile` (décidé au Lot 0), pas sur
> `TrainerApplication`, car il doit survivre à la candidature.
> Statut : ✅ `trainer-applications.ts` (`approveApplication`, T3) saisit
> `TrainerProfile.verifiedLegalName` fourni par l'admin Modération. `payout-methods.ts`
> (`createPayoutMethod`) bloque la création si `verifiedLegalName` est absent — avec le
> code `VERIFIED_LEGAL_NAME_REQUIRED` plutôt que `IDENTITY_NAME_MISSING` (⚠️ écart de
> nommage, effet identique : 422, blocage). Finances n'a jamais de route lui donnant
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
> disponible ; la couche (a) est inactive. `lookupMobileMoneyName()` dans
> `payout-methods.ts` retourne systématiquement `UNAVAILABLE` (point d'extension pour un
> futur vrai provider). Tous les `PayoutMethod` MOBILE_MONEY passent en revue manuelle.
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

**26. Un seul `PayoutMethod` actif** par formateur. L'ajout d'un nouveau désactive
l'ancien, qui reste archivé pour l'audit.
> Statut : ✅ `createPayoutMethod` archive l'actif précédent dans la même transaction
> (`isActive=false`, `archivedAt`, `verificationStatus='ARCHIVED'`). Testé.

**27. Écart de nom non résolu** — Finances ne tranche pas seul. Escalade Super-admin,
qui a accès aux deux (identité et moyen de paiement).
> Statut : ✅ Routes `/api/admin/payout-methods/escalations` (liste des `BLOCKED`) et
> `/api/admin/payout-methods/{id}/escalation-resolve` (`FORCE_VERIFY`/`BLOCK`/`RESTORE`,
> `SUPER_ADMIN` uniquement) implémentées dans `payout-methods.ts`
> (`resolvePayoutMethodEscalation`). L'enum `VerificationMethod.ESCALATION` existe dans
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
> Statut : ⚠️ `AccountNature { INDIVIDUAL, BUSINESS }`, `PayoutMethod.businessDocS3Key`
> et `legalRepProofS3Key` existent dans le schéma (inchangé). `createPayoutMethod`
> capture `accountNature`/`businessName` mais n'a **aucune logique dédiée** distinguant
> la vérification INDIVIDUAL (nom du titulaire) de BUSINESS (dénomination sociale +
> représentant légal) — les deux passent par la même revue manuelle Finances
> générique (`MANUAL_FINANCE`), sans check automatisé ni exigence de documents
> spécifique au type de compte.

**29. Pédagogie avant saisie** — L'écran d'ajout d'un moyen de paiement affiche la règle
**avant** le formulaire. Le choix `INDIVIDUAL` / `BUSINESS` est fait en premier et
conditionne le formulaire.
> Statut : 📋 Spécifié pour le front, inchangé. Aucune page frontend n'existe pour
> l'ajout de moyen de paiement.

**30. Écart de nom détecté** — Message explicite, jamais un rejet opaque : indiquer que
le nom du compte ne correspond pas à l'identité vérifiée, rappeler les deux options
légitimes, proposer le contact support. Ne jamais afficher le `verifiedLegalName`
complet dans ce message.
> Statut : 📋 Spécifié pour le front, inchangé. Les codes d'erreur API existent
> (`MICRO_DEPOSIT_MISMATCH`, rejet Finances avec `reason`) mais aucun ne porte
> spécifiquement ce message pédagogique en trois parties.

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
> Statut : 📋 Aucun modèle de conversation dans `prisma/schema.prisma`. L'écran
> `/messagerie` liste les formateurs des communautés rejointes, sur données de
> démonstration.

**34. Accès après résiliation** — Le membre qui quitte une communauté conserve l'accès
aux replays et aux ressources de la communauté **intégrés pendant sa période
d'adhésion**. Il perd l'accès à tout ce qui est ajouté après sa sortie. Pour un replay,
**c'est la date du live qui fait foi**, pas celle de la mise en ligne de
l'enregistrement.
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
> Statut : 📋 Aucun modèle de conversation. Conséquence : le fil ne peut pas être
> supprimé à la résiliation, seulement passé en lecture seule.

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
> Statut : 📋 Le champ `downloadable` par replay des données de démonstration est donc
> faux : la règle se lira sur le plan. **Ne pas ajouter de case « téléchargeable »** dans
> l'écran formateur. Suppose de modéliser les formules d'abonnement d'une communauté, ce
> qui n'est pas fait.

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
| Jobs | node-cron in-process, jobs idempotents | ✅ **Recalé cette session** — `node-cron` était installé mais rien n'était câblé. `src/instrumentation.ts` + `src/lib/jobs.ts` démarrent désormais les 7 jobs (carence 72h, SLA 48h, auto-timeout litiges, cohérence wallet, alerte wallet négatif, purge documents 90j, nettoyage PendingAttachment), consolidés dans un seul fichier plutôt que `jobs-lot1/2/3.ts` séparés. Chaque job est idempotent au niveau des données (filtres sur statut/date) et journalise `SCHEDULED_JOB_COMPLETED`/`FAILED`. Testé (`tests/jobs.test.ts`). |
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
| **Lot 3** (KYC/Payouts) | 4/4 (`kyc.ts`, `payout-methods.ts`, `payouts.ts`, `wallet-reconciliation.ts`) ✅ | 19/19 ✅ | 0 | 12/12 ✅ | inclus ci-dessus (carence, SLA) |
| **Lot 4** (Parcours cœur) | 4/4 ✅ (inchangé) | 15/15 ✅ (inchangé) | 0/6 | 10/10 ✅ (+2 cette session : webhook rejoué, payload malformé) | — |
| **Total** | 27/27 fichiers lib présents | 64 routes Lots 1-4 + 2 webhooks | 0/9 pages | **41/41 tests passent** (`npx vitest run`, Postgres réel) | 7/7 jobs planifiés câblés |

Écarts encore ouverts (non couverts par les 3 corrections + régénération de cette
session) : voir ⚠️/❌ ci-dessus — notamment la notification de résolution de litige au
formateur (décision 16), la notification de modification de RIB (décision 24), la
distinction INDIVIDUAL/BUSINESS dans la vérification (décision 28), les rate limits non
branchées sur les nouvelles routes, `checkStale()` inutilisé, et les pages frontend des
Lots 1-3 (aucune n'a été demandée dans cette session).
