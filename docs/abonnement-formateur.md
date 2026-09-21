# Abonnement formateur — gestion par le formateur lui-même

*Arbitré le 12 août 2026, avant toute implémentation. Ce document spécifie ce qui
manque côté formateur : le moteur d'abonnement existe (`src/lib/subscriptions.ts`,
décision 70), mais le formateur n'a aucun écran pour voir, résilier, ou payer son
abonnement. Statut de tout ce qui suit : 📋 rien n'existe.*

## Le constat de départ

Côté formateur, l'abonnement se manifeste par **un seul bandeau**, dans
`/formateur/portefeuille`, et uniquement lorsqu'une période est due. Abonnement à
jour : rien, nulle part. `getMySubscription()` calcule déjà cadence, prix, date de
fin de période, statut et date de suspension — l'écran n'en lit que le montant dû,
le reste est calculé et jeté.

Trois champs modélisés ne sont écrits par personne : `pendingCadence` (cadence
souhaitée, décision 52), `subscriptionCanceledAt`, et la valeur `CANCELED` de
`TrainerSubscriptionStatus`. Le seul geste qui lève un impayé est le « Constater »
de `/admin/abonnements` : un formateur qui reçoit « votre abonnement est à régler »
n'a aucun bouton pour le régler.

---

## Arbitrages

### A1 — Résiliation libre, à effet fin de période

Le formateur résilie lui-même, sans demander. La résiliation **ne coupe rien
immédiatement** : la période en cours court jusqu'à son terme, elle n'est ni
écourtée, ni remboursée au prorata. Elle ne se renouvelle simplement pas.

> Reprend à l'identique le patron de l'adhésion apprenant → communauté
> (`cancelMembership` / `resumeMembership`). Le formateur peut **revenir sur sa
> résiliation** tant que la période court.
> Écrit `subscriptionCanceledAt` ; le renouvellement filtre déjà dessus.

### A2 — La liberté de résilier est conditionnelle

Un formateur qui a des **membres payants actifs** dans sa communauté ne peut pas
résilier. Il doit d'abord **fermer sa communauté**, laisser les adhésions en cours
s'éteindre à leur terme, puis résilier.

> « Membre actif » = une adhésion payante en cours, **y compris impayée en sursis**.
> Une adhésion offerte (`provider` nul) et un membre banni ne bloquent pas : ni
> l'une ni l'autre ne représente d'argent en cours.
> ⚠️ **Fermer une communauté n'existe pas.** `Community.status` est testé partout en
> lecture, et le renouvellement des adhésions sait déjà les clore en
> `COMMUNITY_CLOSED` — mais **rien n'écrit jamais autre chose que `active`**. Sans
> cette action, la règle est un cul-de-sac : le formateur est bloqué et renvoyé
> vers un geste qui n'existe pas. À créer **en même temps**, pas après.
> Conséquence à assumer : le départ peut prendre jusqu'à un mois. À dire clairement
> sur l'écran, pas à découvrir au clic.

### A3 — Les lives programmés après le terme sont annulés

La résiliation est acceptée malgré des sessions programmées après la date du terme.
Elles passent en `CANCELED` et les inscrits sont prévenus.

> `cancelLiveSession` existe déjà. Aucune session n'a de prix propre — l'accès vient
> de l'adhésion ou de l'achat — donc **aucun remboursement à traiter**.

### A4 — Au terme : sortie du catalogue, ventes en cours soldées

Au terme de la résiliation, les ressources publiées sortent du catalogue. Les
acheteurs gardent l'accès à ce qu'ils ont payé (principe de la décision 68).
L'espace n'est pas fermé pour autant : il entre dans un **état de solde**.

### A5 — L'état de solde n'a pas de durée fixe

L'espace se ferme quand il ne reste **ni argent à rendre, ni litige ouvert**.
Pendant cet état, le formateur peut : retirer son solde, répondre à ses litiges,
consulter ses factures. Rien d'autre — il ne publie plus, ne vend plus, n'anime plus.

> ⚠️ C'est un troisième état d'espace, ni actif ni fermé. Le statut `CANCELED` de
> l'enum ne dit pas ce qu'il autorise : les gardes d'écriture existantes
> (`canTrainerWrite`, qui ne connaît que `SUSPENDED`) doivent l'apprendre.

### A6 — Le reliquat sous le minimum est versé, frais à sa charge

Le retrait minimum est de 10 000 FCFA. À la fermeture, le **dernier versement
ignore ce plancher** : le formateur récupère ce qu'il a, quelle que soit la somme,
les frais du fournisseur étant retenus sur le montant.

> Sans cette exception, un formateur qui part avec 3 200 FCFA ne peut jamais les
> retirer, donc son espace ne se ferme jamais et la règle A5 boucle indéfiniment.
> ⚠️ **Les frais n'ont nulle part où s'inscrire** : `Payout` ne porte qu'un
> `amountFcfa`, aucun champ de frais n'existe dans le schéma. Migration nécessaire.

### A7 — Retour d'un ancien formateur : réactivation, pièces revérifiées

Un ancien formateur qui revient ne repasse **pas** par une candidature complète : son
dossier reste approuvé. Il règle un abonnement et son espace rouvre. Mais ses
**documents d'identité et son moyen de paiement repassent en vérification** — ils
ont pu expirer ou changer.

> Ses anciennes ressources restent archivées ; il les republie lui-même.

### A8 — Renouvellement automatique : opt-in, sur le solde retirable

Le renouvellement automatique est **inactif par défaut**. Le formateur l'active
lui-même. Une fois actif, l'échéance est prélevée sur son **solde NKAMVA retirable**
— `balance` moins les fonds gelés par des litiges (décision 8), moins un retrait
déjà demandé.

> Jamais sur `balance` brut : les fonds réservés à un litige peuvent devoir être
> rendus à un acheteur, ils ne sont pas disponibles.
> Aucune carte n'est jamais mémorisée. `openProviderPayment` ouvre une session
> Stripe `mode: 'payment'`, sans client ni moyen de paiement enregistré — et PawaPay
> ne sait pas prélever sans geste du payeur. Un « prélèvement automatique par carte »
> serait un chantier séparé et plus lourd ; le solde le rend inutile.

### A9 — Prélèvement à l'échéance, rejoué chaque jour

Le prélèvement tente sa chance à l'ouverture de la période, puis **chaque nuit
pendant les 14 jours de grâce**. Une vente qui tombe le lendemain solde l'échéance
sans que le formateur ait rien à faire.

> **Tout ou rien** : jamais de prélèvement partiel, qui laisserait un reliquat
> impossible à solder proprement. Le montant porte sur le **total** — abonnement
> + paliers de stockage, facturés ensemble (arbitrage 69).
> Solde négatif (après un remboursement) : aucun prélèvement possible.

### A10 — La dette survit à la résiliation et se prélève sur le solde

Résilier avec une période impayée n'éteint pas la dette : la période a été
consommée. Elle est **retenue sur le solde avant tout retrait**. S'il n'y a pas
assez, le reliquat s'éteint à la fermeture de l'espace.

> ⚠️ **Le prélèvement sur solde sert donc deux mécanismes distincts** : le
> renouvellement automatique, qui est opt-in (A8), et la récupération de dette, qui
> ne l'est pas. Un formateur qui n'a jamais activé le prélèvement sera quand même
> débité s'il résilie en laissant une ardoise. L'écran doit le dire — sinon c'est
> exactement le débit-surprise que l'opt-in cherchait à éviter.
> Un reliquat éteint est une perte : elle s'inscrit, elle ne s'oublie pas.

### A11 — Paiement manuel : carte ou mobile money, l'arriéré d'un bloc

Faute de prélèvement automatique — ou après son échec — le formateur règle
lui-même, par carte (Stripe) ou mobile money (PawaPay), par la même porte que
l'activation. Plusieurs périodes dues se règlent **d'un seul bloc**.

> `getMySubscription` calcule déjà un `dueTotalFcfa` unique, et le bandeau l'affiche
> ainsi : régler période par période contredirait ce qui est déjà annoncé.
> Une seule tentative en vol à la fois, comme à l'activation. Une session Stripe
> abandonnée ne se reprend pas — il faut en rouvrir une.
> `PaymentSubject.kind` ne connaît que `PURCHASE` et `TRAINER_ACTIVATION` : il lui
> faut un troisième sujet, `SUBSCRIPTION_CHARGE`.

### A12 — Après suspension, le règlement republie automatiquement

Un formateur suspendu pour impayé qui règle retrouve ses ressources **au catalogue,
automatiquement**.

> ⚠️ **Revient sur la décision 68**, qui pose que les ressources « sont sorties du
> catalogue sur décision, elles y reviennent sur décision ». L'arbitrage 70 doit être
> réécrit, sinon le code contredira le document.
> ⚠️ **Obstacle technique réel** : la suspension fait `published → archived` en masse,
> et `archived` est **la même valeur** que celle qu'un formateur pose en archivant
> lui-même une ressource. Rien ne les distingue, l'audit ne garde que le compte.
> Republier « ce qui a été retiré » ressusciterait ce qu'il avait volontairement
> retiré de la vente. Il faut **marquer les ressources sorties par la suspension** :
> champ sur `Course`, donc migration.

### A13 — Le contenu sous obligation sort du quota

Ce qu'un formateur **ne peut pas effacer parce que quelqu'un l'a payé** ne lui est plus
compté. Il peut donc redescendre de palier, et après son départ rien ne lui est
facturé : la plateforme assume la conservation — elle a déjà pris sa commission sur
ces ventes.

> Dénoue deux problèmes d'un seul geste : le **verrou de palier** (`STORAGE_IN_USE`,
> `storage-tiers.ts:144` — refusé dès que l'espace est occupé, alors que ce qui
> l'occupe est en bonne partie du contenu vendu qu'il n'a pas le droit de supprimer)
> et le **stockage après le terme** (au terme, la ligne de stockage disparaît avec
> l'abonnement, mais les fichiers doivent continuer d'être servis).
>
> Règle de qualification proposée : une ressource est sous obligation dès qu'elle
> porte **au moins un achat abouti**, quel que soit son circuit actuel (décision 53 —
> une ressource vendue devenue incluse garde ses acheteurs). Une ressource servie
> **uniquement** par adhésion communautaire n'est pas sous obligation : l'accès
> s'éteint avec l'adhésion.
>
> ⚠️ **Nécessaire mais pas suffisant.** Il n'existe **aucun moyen d'effacer une
> ressource** : pas de `deleteCourse`, aucune route `DELETE` sur une ressource.
> `archiveCourse` ne change qu'une chaîne, `contentS3Key` et `contentSizeBytes`
> restent. Le quota d'un formateur ne peut donc que **croître** — seule la purge des
> replays à 24 mois rend des octets. Sans chemin de suppression, une ressource
> **jamais vendue** qu'il voudrait retirer pèsera à vie, et le verrou de palier
> subsistera pour elle.
>
> ⚠️ **Conséquence commerciale à assumer** : `minimumTiers` s'effondre. Beaucoup de
> formateurs pourront redescendre à zéro palier, et le revenu du stockage avec.

### A14 — Délai de grâce : 14 jours, confirmés

Les 14 jours de `SUBSCRIPTION_GRACE_DAYS`, jusqu'ici valeur par défaut jamais
arbitrée, deviennent un arbitrage.

> Avec le rejeu nocturne (A9), ce n'est plus seulement un sursis : c'est la fenêtre
> pendant laquelle les ventes du formateur peuvent solder son échéance toutes seules.

### A15 — Espace dormant fermé après 24 mois

Un espace en état de solde sans aucun mouvement — ni retrait, ni litige — se ferme
**24 mois** après le terme, versement dérogatoire compris (A6).

> Aligné sur la conservation des replays (décision 51) : l'espace vit tant que son
> contenu vit.

### A16 — Mobile money : numéro ressaisi à chaque paiement

Rien n'est mémorisé. Aucune donnée personnelle nouvelle à conserver ni à purger.

### A17 — Les replays d'une communauté payante sortent du quota

Le principe d'A13 s'applique aux replays : celui d'un live tenu dans une **communauté
payante** relève d'une obligation envers des membres qui ont payé — il n'est pas
compté. Le replay d'un live en communauté gratuite reste compté : personne n'a rien
payé pour lui.

> Chaque `Replay` porte obligatoirement un `communityId` ; la qualification se lit sur
> `Community.priceFcfa`, sans champ nouveau.
> Portée réelle plus étroite qu'il n'y paraît : les replays hébergés chez **Mux** ne
> consomment **déjà** rien (`sizeBytes` nul à dessein). A17 ne change le calcul que
> pour les replays réellement stockés chez nous.
> Préserve une part du revenu du stockage, là où sortir tous les replays l'aurait
> presque annulé.

### A18 — Suppression : le fichier part, la fiche reste

Le formateur peut supprimer le **contenu** d'une ressource **jamais vendue**. Les
octets sont rendus, la fiche demeure avec son historique, ses statistiques et ses
liens : rien ne casse en aval. Une ressource vendue n'est pas supprimable — elle
continue d'être servie à ses acheteurs.

> Ferme le vide signalé en A13 : sans ce geste, le quota ne redescendait jamais et le
> verrou de palier subsistait pour tout contenu jamais vendu.
> À écrire : `deleteObject` existe déjà dans `s3.ts` ; il manque le service, la route
> et le nettoyage de `contentS3Key` / `contentSizeBytes` / `contentMimeType`.

### A19 — Un remboursement ne rend l'espace qu'à la prochaine échéance

Une ressource dont le seul achat a été remboursé retombe dans le quota, mais **pas le
jour même** : la bascule attend le renouvellement.

> Cohérent avec la décision 61 — rien ne bascule en cours de période. Sans ce délai,
> un remboursement pourrait mettre un formateur en dépassement instantané et bloquer
> ses téléversements du jour au lendemain, sans qu'il ait rien fait.
> Conséquence de mise en œuvre : l'appartenance au contenu sous obligation ne peut pas
> se recalculer à la volée à chaque lecture. Elle se **porte sur la ressource**, posée
> au premier achat abouti, et revue **au renouvellement** — jamais entre deux.

---

## Matrice des cas

### Résiliation

| Cas | Comportement |
|---|---|
| Sans communauté payante, sans live à venir | Acceptée. Terme = fin de période en cours. |
| Avec membres payants actifs | **Refusée.** Fermer la communauté d'abord (A2). |
| Avec adhésions offertes uniquement | Acceptée : aucun argent en cours. |
| Avec membres bannis | Acceptée : ils ne sont plus reconduits de toute façon. |
| Avec lives programmés après le terme | Acceptée, lives annulés, inscrits prévenus (A3). |
| Il se ravise avant le terme | « Reprendre mon abonnement » : `canceledAt` effacé (A1). |
| Avec une période impayée | Acceptée. Dette prélevée sur le solde (A10). |
| Avec un changement de cadence en attente | La résiliation l'emporte, `pendingCadence` effacé. |
| Avec des litiges en cours | Acceptée. L'espace reste en état de solde jusqu'à leur clôture (A5). |
| Au terme | Ressources hors catalogue, acheteurs inchangés, espace en état de solde (A4). |
| Solde ≥ 10 000 FCFA au terme | Retrait normal, puis fermeture. |
| Solde < 10 000 FCFA au terme | Versement dérogatoire, frais retenus, puis fermeture (A6). |
| Solde nul, aucun litige | Fermeture immédiate au terme. |
| Ni retrait ni litige pendant 24 mois | Versement dérogatoire, fermeture (A15). |
| Il revient plus tard | Réactivation par paiement, pièces revérifiées (A7). |

### Stockage

| Cas | Comportement |
|---|---|
| Ressource avec au moins un achat abouti | Hors quota, hors facturation, conservée (A13). |
| Ressource servie uniquement par adhésion | Dans le quota : l'accès s'éteint avec l'adhésion. |
| Ressource jamais vendue, archivée | Dans le quota tant qu'il n'a pas supprimé son contenu (A18). |
| Ressource jamais vendue, contenu supprimé | Hors quota. Fiche conservée, octets rendus (A18). |
| Ressource vendue, il veut la supprimer | Refusé : elle est servie à ses acheteurs (A18). |
| Replay d'une communauté payante | Hors quota (A17). |
| Replay d'une communauté gratuite | Dans le quota. |
| Replay hébergé chez Mux | Hors quota déjà aujourd'hui, quelle que soit la communauté. |
| Seul achat d'une ressource remboursé | Elle retombe dans le quota **au renouvellement**, pas le jour même (A19). |
| Réduction de palier sous l'occupé | Refusée (`STORAGE_IN_USE`), mais l'occupé se calcule désormais hors obligation. |
| Après le terme de la résiliation | Aucune facturation de stockage : tout ce qui reste est sous obligation (A13). |
| Paliers dus sur une période impayée | Inclus dans le total prélevé ou réclamé (A9, A10). |

### Renouvellement automatique

| Cas | Comportement |
|---|---|
| Inactif (défaut) | Rien n'est prélevé. Période `DUE`, notification, règlement manuel. |
| Actif, retirable ≥ dû | Prélevé. Période `SETTLED`, facture, notification. |
| Actif, retirable insuffisant | **Rien n'est prélevé.** `DUE`, `PAST_DUE`, grâce, rejoué chaque nuit (A9). |
| Actif, solde négatif | Idem : rien à prélever. |
| Actif, solde suffisant mais gelé par un litige | Rien n'est prélevé : ces fonds ne nous appartiennent pas. |
| Actif, retrait déjà demandé | Le retirable est amputé d'autant. Le retrait passe avant. |
| Actif, échec J puis vente à J+3 | Le rejeu nocturne solde l'échéance sans geste du formateur (A9). |
| Actif, abonnement gratuit (cohorte de lancement) | Période `WAIVED`. Aucun prélèvement, aucun bouton de paiement. |
| Actif, paliers de stockage facturés | Prélèvement sur le **total**, tout ou rien. |
| Activé alors qu'une période est déjà impayée | Le rejeu de la nuit suivante tente le prélèvement. |
| Il règle à la main la nuit du prélèvement | Ne pas débiter deux fois : la période réglée sort du rejeu. |

### Paiement manuel

| Cas | Comportement |
|---|---|
| Une période due | Carte ou mobile money, montant = `dueTotalFcfa`. |
| Plusieurs périodes dues | Réglées d'un bloc (A11). |
| Une tentative déjà en vol | Refusée, comme à l'activation. |
| Session Stripe abandonnée | Non reprise : nouvelle session à ouvrir. |
| Échec fournisseur | Motif affiché, comme sur l'écran d'activation. |
| Règlement après suspension | Ressources republiées automatiquement (A12). |
| Règlement pendant l'état de solde | Sans objet : l'abonnement est résilié, il n'y a plus d'échéance. |

---

## Ce qu'il faut créer

**Migrations**
1. Marqueur sur `Course` distinguant une sortie de catalogue subie d'un archivage
   volontaire (A12).
2. Champ de frais sur `Payout`, pour le versement dérogatoire (A6).
3. Trace du débit de solde : le portefeuille n'a **pas de grand-livre**, seulement
   `WalletReconciliation` pour les corrections manuelles. Un solde qui baisse sans
   ligne pour l'expliquer est un défaut, pas un détail.
4. Drapeau de renouvellement automatique sur `TrainerProfile` (A8).
5. Fermeture de communauté : écrire enfin autre chose que `active` dans
   `Community.status` (A2).
6. Marqueur d'obligation sur `Course` : posé au premier achat abouti, revu au
   renouvellement seulement (A13, A19). C'est ce qui permet à
   `trainerStorageUsedBytes` d'exclure sans jointure par ressource à chaque lecture.

**Écrans**
- `/formateur/abonnement` : état, cadence, prochaine échéance, montant, historique,
  changement de cadence, renouvellement automatique, résiliation, paiement.
- Une sixième entrée dans `TRAINER_SECTIONS`.
- L'action « fermer ma communauté » (A2).
- La suppression du contenu d'une ressource jamais vendue (A18).

**Services**
- Troisième `PaymentSubject`, `SUBSCRIPTION_CHARGE` (A11).
- Prélèvement sur solde, partagé par A8 et A10.
- Job de rejeu nocturne (A9), et job de fermeture des espaces dormants (A15).
- `canTrainerWrite` doit connaître l'état de solde (A5).
- `trainerStorageUsedBytes` doit exclure le contenu sous obligation et les replays
  de communauté payante (A13, A17).
- Révision du marqueur d'obligation au renouvellement (A19).
- Suppression du contenu d'une ressource : service, route, nettoyage des trois champs
  de contenu (A18). `deleteObject` existe déjà dans `s3.ts`.

---

## Plan d'implémentation

*Ordre de construction. Chaque lot se termine par une vérification qui lui est propre :
`tsc` vert ne prouve rien, et un 200 non plus — la mémoire du projet le rappelle assez.*

**✅ Les douze lots sont livrés (12 août 2026).** 74 tests ajoutés, tous verts ; `tsc`
vert ; l'écran vérifié au navigateur sur la base de dev. La campagne complète rend
518 tests passants sur 531, les 13 échecs restants étant ceux qui préexistaient sur
`develop` — mêmes cinq fichiers, tous dans le paiement, les litiges et les adhésions.

**Cinq migrations** et non six : le marqueur de sortie de catalogue a voyagé avec
`SubscriptionPayment`, les deux servant le même arbitrage 12 —
`course_obligation_marker`, `wallet_debit_trace`, `trainer_auto_renew`,
`subscription_payment_and_catalog_suspension`, `payout_closing_and_fees`.

La fermeture de communauté n'en a demandé aucune : `Community.status` était déjà une
chaîne libre, testée partout en lecture. Il ne manquait qu'un auteur.

**Contraintes valables pour tous les lots**

- Migrations par `prisma migrate`, **jamais** `db:push`. `directUrl` se fait recommenter
  dans le schéma ; le vérifier avant, sinon `migrate` reste muet indéfiniment.
- La base de dev est le Supabase du `.env` (≈ 223 ms par aller-retour). La suite de
  tests, elle, tourne sur la base locale 5433 : **13 échecs préexistants sur
  `develop`**, à ne pas s'attribuer.
- ⚠️ **`AWS_BUCKET_NAME=nkamva-production` en dev.** Tout lot qui appelle `deleteObject`
  ne se vérifie pas contre le seau réel — lot 3 en particulier.

### Lot 1 — Le marqueur d'obligation (A13, A19)

Fonde tout le reste : `storageChargeFor` alimente `amountDueFcfa`, donc chaque montant
prélevé, réclamé ou affiché ensuite. Les chiffres d'abord.

Migration `Course.obligationAt`, rétro-remplissage sur toute ressource ayant un achat
abouti, pose du marqueur au règlement d'un achat, révision au renouvellement seulement.

*Vérification : tests unitaires sur la pose, la révision différée et le rétro-remplissage.*

### Lot 2 — Le quota dit la vérité (A13, A17)

`trainerStorageUsedBytes` exclut le contenu sous obligation et les replays de communauté
payante. `minimumTiers` et le refus `STORAGE_IN_USE` suivent mécaniquement.

*Vérification : tests sur les quatre cas de replay (payante, gratuite, Mux, purgé) et sur
la réduction de palier redevenue possible.*

### Lot 3 — Suppression du contenu (A18)

Service, route et action d'écran pour supprimer le contenu d'une ressource jamais vendue.
Nettoyage de `contentS3Key`, `contentSizeBytes`, `contentMimeType` ; la fiche reste.

*Vérification : tests unitaires avec S3 simulé. **Pas de smoke test contre le seau réel.***

### Lot 4 — Le prélèvement sur solde (A8, A10)

Migration de la trace de débit — le portefeuille n'a aucun grand-livre aujourd'hui — et
service de prélèvement : sur le **retirable** seulement, tout ou rien, jamais sur le
réservé, jamais sur un solde négatif.

*Vérification : tests sur solde suffisant, insuffisant, négatif, entièrement réservé,
retrait en cours.*

### Lot 5 — Renouvellement automatique (A8, A9)

Migration du drapeau `autoRenew` (défaut faux), tentative à l'échéance, rejeu nocturne
pendant les 14 jours de grâce, et garde contre le double débit si un règlement manuel
est passé entre-temps.

*Vérification : tests sur le rejeu qui aboutit à J+3, et sur l'échéance déjà réglée.*

### Lot 6 — Paiement manuel de l'abonnement (A11, A12)

Troisième `PaymentSubject` (`SUBSCRIPTION_CHARGE`), route d'initiation, branchement des
deux webhooks. Migration du marqueur de sortie de catalogue subie, et republication
automatique au règlement.

*Vérification : tests sur l'arriéré réglé d'un bloc ; smoke test du parcours de paiement
jusqu'à la page hébergée.*

### Lot 7 — Fermeture de communauté (A2)

Écrire enfin autre chose que `active` dans `Community.status` : action formateur, refus
des nouvelles adhésions, extinction des adhésions en cours à leur terme.

*Vérification : tests sur l'extinction ; smoke test de l'action.*

### Lot 8 — Résiliation et état de solde (A1 à A5, A10)

`cancelSubscription` / `resumeSubscription`, refus si des membres payants sont actifs,
annulation des lives programmés après le terme. Au terme : sortie du catalogue, statut
`CANCELED`, prélèvement de la dette résiduelle. `canTrainerWrite` apprend cet état.

*Vérification : tests sur les quatorze cas de la matrice « Résiliation ».*

### Lot 9 — Fin de vie de l'espace (A6, A15)

Migration des frais sur `Payout`, versement dérogatoire sous le minimum de 10 000 FCFA,
job de fermeture des espaces dormants à 24 mois.

*Vérification : tests sur le reliquat sous le plancher et sur le dormant.*

### Lot 10 — Réactivation (A7)

Réouverture par paiement sans nouvelle candidature ; documents et moyen de paiement
repassent en vérification.

*Vérification : test du parcours complet départ → retour.*

### Lot 11 — L'écran (le seul livrable visible)

`/formateur/abonnement` : état, cadence et son changement — `pendingCadence` n'a jamais
été écrit par personne (décision 52) —, renouvellement automatique, résiliation,
paiement, historique. Sixième entrée dans `TRAINER_SECTIONS`.

*Vérification : smoke test au navigateur avec cookie de session forgé. Vérifier le DOM,
pas le code HTTP : `error.tsx` absorbe les plantages de rendu et rend un 200.*

### Lot 12 — Réécriture des décisions

Dans `docs/decisions-nkamva.md` : la décision 68 (A12 revient sur le retour au catalogue
« sur décision ») et l'arbitrage 70 (A14 fait des 14 jours un arbitrage). Document de
référence — à ne pas modifier sans accord explicite.

---

## Points non arbitrés

Aucun. Les dix-neuf arbitrages couvrent les cas recensés dans les quatre matrices.

Deux conséquences restent à surveiller à la mise en œuvre, sans être des questions
ouvertes :

- **Le revenu du stockage va baisser.** `minimumTiers` s'effondre pour tout formateur
  dont le catalogue est majoritairement vendu. C'est la contrepartie assumée d'A13.
- **La décision 68 et l'arbitrage 70 doivent être réécrits** dans
  `docs/decisions-nkamva.md` : A12 revient sur le retour au catalogue « sur décision »,
  et A14 transforme les 14 jours de grâce d'un défaut non arbitré en arbitrage.
