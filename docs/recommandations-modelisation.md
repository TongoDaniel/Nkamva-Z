# Recommandations de modélisation — NkamVa

> **Ce document n'a pas la même autorité que `decisions-nkamva.md`.** Celui-ci recense
> des arbitrages **tranchés** ; celui-ci propose. Rien ici n'est à implémenter tel quel
> sans validation : chaque section dit ce qu'elle recommande, pourquoi, et ce que coûte
> l'option inverse.
>
> **État au 3 août 2026**, écrit après les arbitrages 44 à 57.

---

## 1. Quota de stockage — réutiliser le patron du wallet, ne pas en inventer un

**Constat.** L'arbitrage 54 (40 Go par formateur, blocage en écriture au dépassement)
demande une comptabilité d'octets. C'est exactement la forme des invariants financiers
déjà en place, et les pièces existent :

- `presignUpload(s3Key, mimeType, sizeBytes)` passe `ContentLength` au `PutObjectCommand`.
  R2 **refuse** un corps d'une autre taille : la taille déclarée est contraignante, donc
  un contrôle de quota à la signature est réellement opposable, pas déclaratif.
- `PendingAttachment` porte déjà `sizeBytes`, `expiresAt`, `consumedAt`, `sha256`, avec
  son job de nettoyage : c'est le registre du « réservé », tout prêt.
- `headObject()` existe : un job de réconciliation peut comparer le compteur au réel.

**Recommandation.** Un compteur `storageBytesUsed` sur `TrainerProfile`, maintenu **dans
la transaction** métier (jamais en fire-and-forget — convention Lot 0 sur l'audit), avec
`PendingAttachment` en réservation, et le refus à la signature si
`used + pending + sizeBytes > quota`. Puis un job de cohérence sur le modèle de
`reconcileAllWallets` : il journalise et alerte, **il ne répare jamais en silence**.

**Pourquoi.** L'invariant est le même que `Wallet.reservedBalance` et il a déjà été
écrit, testé et outillé une fois. En inventer un second, c'est deux endroits où le solde
peut dériver au lieu d'un.

**Coût de l'option inverse.** Compter au moment de la consommation plutôt qu'à la
signature laisse un formateur téléverser 200 Go avant qu'on s'en aperçoive : le
téléversement est direct vers R2, le serveur ne voit jamais passer les octets.

---

## 2. Suspension d'abonnement — bloquer l'écriture, jamais la lecture

**Constat.** `TrainerSubscriptionStatus` prévoit déjà `PAST_DUE` et `SUSPENDED`, et
l'arbitrage 56 (gratuité de lancement) crée mécaniquement une échéance de bascule où des
formateurs ne paieront pas. La question « que devient son contenu ? » va se poser en vrai.

**Recommandation.** Appliquer **exactement la règle de l'arbitrage 54** : la sanction
porte sur le chemin d'écriture (`presignUpload`, création de ressource, programmation
d'un live), jamais sur la lecture. Les apprenants qui ont acheté ou qui sont membres
continuent d'accéder à tout.

**Pourquoi.** Un achat est définitif (arbitrages 2, 12, 53) et une adhésion est payée
d'avance. Couper l'accès des apprenants pour un impayé **du formateur** transforme un
défaut de paiement en litige de masse — et chaque litige ouvert réserve des fonds
(arbitrage 8). Le remède coûterait plus cher que le mal.

**Corollaire à trancher.** Que devient la commission de 15 % sur les ventes d'un
formateur suspendu ? Elle continue de s'appliquer si ses ressources restent en vente ;
si elles sont retirées du catalogue, il n'y a plus de vente du tout — et donc plus rien
pour rattraper l'impayé.

---

## 3. Prix et réductions — un tarif daté, un montant snapshoté

**Constat.** L'arbitrage 57 demande de gérer la réduction annuelle et les réductions
promotionnelles ; l'arbitrage 56 admet un prix nul. Le tarif public va donc changer
plusieurs fois, et des abonnements en cours devront y survivre.

**Recommandation.** Deux objets distincts, et pas un champ `priceFcfa` de plus :

1. un **tarif** daté (cadence, montant, période de validité) — c'est là que vit la
   gratuité de lancement, comme un tarif à 0 valable du *jj/mm* au *jj/mm* ;
2. un **montant consenti snapshoté sur l'abonnement** au moment de la souscription et de
   chaque renouvellement, exactement comme `Purchase` fige `commissionRate`,
   `trainerShareFcfa` et `platformShareFcfa`.

La réduction se stocke en **montant** (`Int`, FCFA), le pourcentage n'étant qu'un
affichage. Deux réductions se cumulent alors sans ambiguïté d'arrondi, et la convention
Lot 0 « jamais de `Float` sur de la monnaie » est respectée sans effort.

**Pourquoi.** La gratuité de lancement cesse alors d'être un cas particulier codé en
dur : c'est un tarif comme un autre, avec une date de fin. Et l'historique de facturation
reste reconstituable — ce qui sera demandé le jour où un formateur contestera un débit.

**Ne pas loger le tarif dans `Setting`.** L'arbitrage 59 confie la tarification au
Super-admin, et `Setting` (clé / valeur `String` / `updatedById`) semble tout indiqué —
mais un tarif a une cadence, un montant, une plage de validité et un historique. Le
mettre en JSON dans une colonne texte, c'est perdre le typage, l'index et surtout la
possibilité de dire *quel prix était en vigueur le 12 mars*. Un modèle dédié, avec une
ligne par tarif daté, coûte la même migration et répond à la question.

---

## 3 bis. Cumul des réductions — un plancher, et la meilleure l'emporte

**Constat.** L'arbitrage 62 retient les trois canaux à la fois : campagne globale, remise
par formateur, code promo. Rien n'interdit qu'ils tombent sur le même abonnement le même
jour.

**Recommandation.** **La réduction la plus favorable l'emporte, elles ne s'additionnent
pas**, et un plancher est posé en dur (jamais en dessous de X FCFA, hors gratuité
décidée par le Super-admin au titre de l'arbitrage 59).

**Pourquoi.** L'addition est le comportement qu'on ne peut pas rattraper : trois remises
de 40 % cumulées mènent l'abonnement à zéro, et personne ne l'a décidé — ni celui qui a
lancé la campagne, ni celui qui a négocié la remise, ni celui qui a créé le code. Le
« meilleur des trois » donne le même geste commercial sans le risque, et se raconte
simplement au formateur : *la meilleure offre disponible vous a été appliquée*.

**Garde-fous pour le code promo**, le seul des trois qu'un formateur saisit lui-même :
plage de validité, compteur d'usages, unicité par formateur, et **valable à la
souscription uniquement, pas au renouvellement** — sinon une remise ponctuelle devient un
tarif acquis à vie. `RATE_LIMITS` existe déjà dans `rate-limit.ts` mais n'est branché sur
aucune route : c'en est un bon premier client.

---

## 4. Messagerie — un seul état « lecture seule », deux causes

**Constat.** L'arbitrage 39 impose déjà un fil lisible mais non écrivable pour le membre
résilié. Le membre banni (`CommunitySubscription.bannedAt`) demande le même état.

**Recommandation.** Ne pas inventer un second mécanisme : **banni = lecture seule**,
comme résilié. Une branche à écrire, une à tester, un seul chemin où se tromper.

---

## 5. Signalements — combler un trou, pas ajouter une rustine

**Constat, à prendre au sérieux.** L'arbitrage 7 donne à la Modération « les
signalements, la modération des ressources, les interactions » — et **aucun modèle de
signalement n'existe dans `prisma/schema.prisma`**. Le rôle a des permissions sur un
objet absent. Or trois surfaces vont le réclamer en même temps : messagerie privée,
salon de live conservé (arbitrage 42), ressources.

**Recommandation.** Un modèle **`Report` générique** (`targetType`, `targetId`, motif,
statut, décision, auteur) écrit **une seule fois**, plutôt qu'un signalement par surface.
`DisputeMessage` donne déjà la forme d'un fil modérable avec pièces jointes et rôle
d'auteur ; `AuditLog` et `notifyAdminSubRole('MODERATION')` sont en place.

**Coût de l'option inverse.** Trois tables de signalement quasi identiques, trois écrans
d'admin, et une modération qui ne sait pas répondre à « montre-moi tout ce qui est
signalé ».

---

## 6. Notifications de message — oui, mais dédupliquées

**Constat.** `Notification.type` est un `String` libre : ajouter un type de message ne
coûte rien au schéma. Mais `listMyNotifications` plafonne à **50 lignes**, et
`/notifications` retombe déjà sur l'icône `MessageSquare` pour tout type contenant
`MESSAGE`.

**Recommandation.** **Une notification non lue par conversation**, mise à jour plutôt que
répétée. Sinon une seule conversation bavarde évince du plafond toutes les notifications
de litige, de validation et de retrait — celles qui portent de l'argent.

---

## 7. Lives — ne pas modéliser l'inscription

**Constat.** La maquette affiche « 38 membres inscrits », ce qui suppose une table
d'inscription distincte de la présence. L'arbitrage 46 lui retire sa seule fonction : la
capacité étant la communauté entière, une inscription ne filtre rien et ne réserve rien.

**Recommandation.** Pas de modèle d'inscription. Afficher la **taille de la communauté**
avant la séance, et la **présence effective** après. Un modèle en moins, et un chemin
d'écriture en moins avant le live.

---

## 8. Rappel avant un live — pas de préférence utilisateur pour l'instant

**Constat.** Le rappel « 15 min avant » demanderait un champ de préférence sur `User`.
Aucun écran de réglages n'existe pour l'exposer.

**Recommandation.** Rappel **par défaut**, sans préférence, via `notify()` et un job dans
`jobs.ts` (qui en porte déjà sept). L'opt-out viendra avec l'écran qui le rend
modifiable.

**Pourquoi.** Un champ de préférence que personne ne peut modifier est un champ mort qui
donne l'illusion que la fonctionnalité existe.

---

## 9. Fuseaux horaires — UTC en base, fuseau déclaré sur la session

**Recommandation.** Tout stocker en UTC, mais conserver sur la session le fuseau **dans
lequel le formateur l'a programmée**, et l'afficher.

**Pourquoi.** Entre WAT et CAT, « 18h00 » est ambigu. Un formateur qui annonce 18h à sa
communauté et voit son live affiché à 19h chez ses membres n'a aucun moyen de comprendre
d'où vient l'écart — ni de le corriger.

---

## 10. Circuit d'une ressource — un enum, pas un prix nullable

**Constat.** L'arbitrage 47 rend les circuits exclusifs, le 53 interdit le retour en
arrière. `Course.priceFcfa` est aujourd'hui un `Int` non nul, ce qui n'a plus de sens
pour une ressource incluse.

**Recommandation.** Garder `priceFcfa` non nul et ajouter un champ de circuit
(`MARKETPLACE` / `COMMUNITY`).

**Pourquoi.** Le prix historique d'une ressource passée en incluse reste lisible pour le
formateur, et l'interdit du 53 se vérifie sur une **transition d'enum** — explicite,
testable — plutôt que sur l'apparition ou la disparition d'un montant.

**À signaler au formateur dans l'écran, pas seulement dans le code** : une ressource
passée en incluse puis **déliée** (arbitrage 48) n'est plus ni vendue ni incluse, et ne
peut plus repasser en vente. Elle est définitivement hors commerce. Il doit le savoir
**avant** de basculer.

---

## 11. Purge des replays — prévenir les deux parties

**Recommandation.** Une notification à J-30 avant la purge des 24 mois (arbitrage 51),
au membre **et** au formateur.

**Pourquoi.** Côté membre, le téléchargement étant un droit uniforme (arbitrage 55), la
notification transforme la purge en fenêtre d'action plutôt qu'en perte sèche. Côté
formateur, la purge lui **rend du quota** (arbitrage 54) : c'est une bonne nouvelle qu'il
a intérêt à anticiper s'il est bloqué en écriture.

---

## 12. Ordre d'implémentation suggéré

1. **La relation `Community` → `Course`** (avec `linkedAt`/`unlinkedAt` et le champ de
   circuit). Elle débloque à elle seule l'onglet « Incluses (communauté) » de
   `/mes-ressources`, et porte les arbitrages 44, 45, 47, 48 et 53.
2. **`LiveSession` + `Replay`.** Quatre écrans sont déjà dessinés et attendent le modèle ;
   `Course.livekitRoomName` disparaît à ce moment-là (arbitrage 32).
3. **Le modèle `Report`** (recommandation 5), avant la messagerie plutôt qu'après.
4. **La messagerie.** C'est elle qui dépend le plus du reste : adhésion (33), lecture
   seule (39 + recommandation 4), signalements, notifications.

**Pourquoi cet ordre.** Chaque étape retire un `DemoNotice` complet plutôt que de câbler
à moitié plusieurs écrans — c'est ce marqueur qui distingue « pas encore câblé » de
« câblé mais vide ».
