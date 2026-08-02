# Espace apprenant — ce qui reste à brancher

**État au 2 août 2026.** Six écrans existent désormais en interface mais ne
reposent sur aucune donnée réelle : côté apprenant `/messagerie`, `/mes-lives`,
`/mes-lives/live/[sessionId]`, `/mes-lives/replay/[replayId]` ; côté formateur
`/formateur/lives` et `/formateur/lives/[sessionId]/console`. Ils affichent des
données de `src/features/demo/` et portent tous un `DemoNotice`.

Ce document liste ce qu'il manque pour les brancher. Il a d'abord été écrit avant
l'espace formateur, en pariant que **c'est le côté formateur qui répondrait à une
partie des questions** — ce qui s'est vérifié : construire la console a produit
les arbitrages 40 à 43, et refermé quatre des questions ouvertes ci-dessous.

---

## Déjà arbitré (2 août 2026)

Treize règles sont tranchées et reportées dans `decisions-nkamva.md`
(arbitrages 31 à 43). Elles ne sont plus à discuter, seulement à implémenter.

| # | Règle |
|---|---|
| 31 | **Le live est une visioconférence** : apprenants et formateur parlent tous. La main levée signale une demande de parole, elle ne la conditionne pas. |
| 32 | **Un live appartient à une communauté**, jamais à une ressource. `Course.livekitRoomName` est un vestige à retirer. |
| 33 | **Messagerie réservée aux membres** : échanger avec un formateur suppose d'être dans sa communauté. Un achat à l'unité n'ouvre aucun droit de conversation. |
| 34 | **Après résiliation**, le membre garde les replays et les ressources intégrés pendant son adhésion. Pour un replay, **la date du live fait foi**, pas celle de la mise en ligne. |
| 35 | **Le formateur modère la parole** : couper le micro de tous, d'un seul ou de plusieurs, et rouvrir. Le participant coupé ne se réactive pas seul. |
| 36 | **La file des mains levées est ordonnée et numérotée** : on sait qui a demandé la parole en premier. |
| 37 | **Le locuteur actif est affiché** : on voit qui parle à un instant donné. |
| 38 | **L'enregistrement est automatique** : tout live produit un replay, sans décision au lancement. |
| 39 | **L'historique de conversation survit à la sortie** : lecture seule, pour que le membre le retrouve s'il revient. |
| 40 | **Pas d'exclusion en séance** : le formateur coupe un micro, il ne retire personne. Écarter quelqu'un relève du bannissement de communauté. |
| 41 | **La main levée est le seul canal** pour redemander son micro : une seule file, pas deux. |
| 42 | **Le salon du live est conservé** et rattaché au replay. |
| 43 | **Le téléchargement d'un replay dépend du plan** d'abonnement, pas d'un réglage par session. |

### Ce qui est déjà rendu côté apprenant

Les arbitrages 31, 35, 36 et 37 ont une moitié visible dans
`src/app/(app)/mes-lives/live/[sessionId]/live-room.tsx`, sur données de
démonstration :

- micro et caméra libres, main levée sans effet sur le droit de parler (31) ;
- `LiveParticipant.mutedByHost` désactive la commande micro et affiche « Votre
  micro a été coupé par l'animateur » (35) ;
- `LiveParticipant.handRaisedAt` ordonne la file, chaque main levée porte son
  rang sur l'avatar, et l'apprenant lit sa propre position (36) ;
- `LiveParticipant.speaking` affiche « X a la parole » sous la scène et une
  icône dans la liste (37).

L'autre moitié — **déclencher** la coupure, **consommer** la file, **produire**
la détection du locuteur — appartient à l'espace formateur, et elle est
désormais rendue elle aussi dans
`src/app/(app)/formateur/lives/[sessionId]/console/live-console.tsx`, sur le
plateau de démonstration de `src/features/demo/trainer-live-data.ts` :

- « Couper tous les micros » / « Tout rouvrir » sur la scène, coupure d'un seul
  ou d'une sélection dans l'onglet Participants (35) ;
- file numérotée avec la durée d'attente, « Donner la parole » qui lève le
  verrou et baisse la main du même geste (36, 41) ;
- bandeau « X a la parole », identique à celui de l'apprenant (37) ;
- bandeau « Enregistrement en cours », sans bascule : rien à décider (38).

Les deux écrans restent donc symétriques mais **muets** : aucun des deux
n'émet, aucun ne lit l'état de l'autre. C'est le transport temps réel qui les
reliera.

Deux conséquences de modélisation en découlent directement :

- L'arbitrage 34 exige une relation **`Community` → `Course`**, qui n'existe pas.
  C'est déjà ce qui bloque l'onglet « Incluses (communauté) » de
  `/mes-ressources`. Il faut aussi une **date d'intégration par contenu** : sans
  elle, impossible de dire ce qui précède la sortie du membre. La période
  d'adhésion, elle, est déjà lisible sur `CommunitySubscription`
  (`periodStart`, `periodEnd`, `canceledAt`).
- L'arbitrage 31 fixe le dimensionnement : **tout participant émet**. Ce n'est
  pas le coût d'une diffusion un-vers-tous, et cela pèse sur le choix
  d'infrastructure comme sur une éventuelle limite de participants.

---

## 1. Messagerie

**Écran** : `src/app/(app)/messagerie/` · **données** :
`src/features/demo/message-data.ts`

L'interface tient : liste des conversations, fil, composeur, séparateurs de
journée, repli mobile. Ce qui manque est entièrement côté modèle.

### Modèles absents

Aucune entité de conversation n'existe dans `prisma/schema.prisma`. Il faut au
minimum une conversation et ses messages, avec un compteur de non-lus
exploitable sans charger tout le fil.

### Tranché

**Arbitrage 33** : le droit de conversation vient de l'adhésion à la communauté,
pas de l'achat d'une ressource. Le fil se rattache donc à
`CommunitySubscription`, et un acheteur à l'unité n'a aucun accès à la
messagerie du formateur.

**Arbitrage 39** : à la résiliation, l'écriture cesse mais le fil reste lisible.
Il ne doit donc jamais être supprimé, seulement passé en lecture seule — pour que
le membre le retrouve s'il revient.

### Encore à trancher

- **Membre banni** : `CommunitySubscription.bannedAt` existe. Un abonnement
  encore `ACTIVE` mais banni ouvre-t-il toujours la messagerie ?
- **Modération** : les messages privés entrent-ils dans le périmètre des
  signalements, comme les messages de litige ? Si oui, il faut des pièces
  jointes et une trace d'audit, comme `DisputeMessage`.
- **Notifications** : un message reçu doit-il produire une `Notification` ? Le
  type n'existe pas encore ; l'écran `/notifications` sait déjà l'afficher (il
  retombe sur l'icône `MessageSquare` pour tout type contenant `MESSAGE`).

### Points d'accroche existants

- `src/lib/notification.ts` — `notify()` pour l'alerte, déjà lue par
  `/notifications`.
- `DisputeMessage` dans le schéma est le modèle de fil le plus proche : même
  besoin de pièces jointes, de rôle d'auteur et d'horodatage.

---

## 2. Mes lives & agenda

**Écran** : `src/app/(app)/mes-lives/` · **données** :
`src/features/demo/live-data.ts`

L'interface tient : onglets À venir / Replays avec compteurs, calendrier du mois
avec les jours marqués cliquables, listes, panneau latéral.

### Modèles absents

Pas de `LiveSession`, pas de `Replay`. Seul `Course.livekitRoomName` existe —
vestige d'un branchement LiveKit qui n'a pas de session à rattacher.

### Tranché

**Arbitrage 32** : le live appartient à une communauté. L'accès se lit donc sur
`CommunitySubscription`, et `Course.livekitRoomName` est à retirer.

### Encore à trancher

- **Inscription** : « 38 membres inscrits » suppose une table d'inscription
  distincte de la présence effective. Est-ce nécessaire, ou la présence suffit-elle ?
- **Rappel 15 min avant** : demande un champ de préférence sur `User` (absent) et
  un job planifié. `src/lib/jobs.ts` existe et sait déjà porter des tâches
  périodiques.
- **Fuseaux** : la maquette affiche « 18h00 UTC ». Faut-il stocker un fuseau par
  session, ou tout garder en UTC et convertir à l'affichage ?

---

## 3. Live (session en direct)

**Écran** : `src/app/(app)/mes-lives/live/[sessionId]/`

L'interface tient : salle d'attente avec décompte et rappel, état direct avec
zone vidéo, commandes micro / caméra / main levée, panneau Salon / Participants /
Notes. Le basculement attente → direct se calcule sur l'heure de début.

### Ce qui manque techniquement

- **Le transport temps réel.** Les variables `LIVEKIT_URL`, `LIVEKIT_API_KEY` et
  `LIVEKIT_API_SECRET` sont déjà dans `.env`, mais aucun code ne les lit. Il faut
  la génération de jeton d'accès côté serveur, et la salle rattachée à la session.
- **Le salon de discussion** : l'arbitrage 42 le conserve et le rattache au
  replay. Il faut donc un modèle de messages de session — et il rejoint la
  question de modération de la messagerie.
- **Les notes de session** : aujourd'hui dans l'état local du composant. Les
  persister demande un modèle, et probablement de les rattacher au replay pour
  qu'elles restent utiles après coup.

### Tranché

**Arbitrages 31, 35, 36, 37, 38, 40, 41, 42** : visioconférence où tout le monde
parle ; le formateur modère les micros mais n'exclut personne ; la file des mains
levées est ordonnée, numérotée, et c'est le seul canal pour redemander son micro ;
le locuteur actif est affiché ; l'enregistrement est automatique ; le salon est
conservé. Les deux moitiés sont rendues (voir « Ce qui est déjà rendu » en tête
de document).

### Encore à trancher

- **Capacité** : y a-t-il une limite de participants par session, et que voit le
  membre au-delà ? L'arbitrage 31 rend la question sensible : chaque participant
  émet. **Seule question de cette section restée ouverte**, et la console
  formateur ne la refermera pas : elle dépend du coût d'infrastructure, pas d'un
  écran.

---

## 4. Replay

**Écran** : `src/app/(app)/mes-lives/replay/[replayId]/`

L'interface tient : lecteur avec progression simulée, position, son, vitesse,
téléchargement conditionnel, fiche de la session, bloc de notes.

### Ce qui manque techniquement

- **Le stockage et la lecture.** `src/lib/s3.ts` gère déjà des URL présignées
  pour les ressources téléchargeables : le même mécanisme convient, mais un
  enregistrement de live est bien plus lourd qu'un PDF. Faut-il un transcodage
  (Mux est déjà dans `.env` et inutilisé) ou un simple MP4 servi tel quel ?
- **La reprise de lecture.** `CourseView.watchedSeconds` fait déjà cela pour les
  ressources ; un replay a le même besoin et pourrait suivre le même modèle.

### Tranché

**Arbitrages 34 et 38** : tout live produit un replay, et le membre qui part
garde ceux dont **le live** s'est tenu pendant son adhésion — la date de mise en
ligne de l'enregistrement ne compte pas. La règle suppose une date d'intégration
par contenu pour les ressources ; pour les replays, la date de session suffit.

### Encore à trancher

- **Réabonnement** : un ancien membre qui revient récupère-t-il ce qui a été
  ajouté pendant son absence, ou seulement ce qui suit son retour ? L'arbitrage
  39 conserve le fil de conversation pour ce cas précis, mais ne dit rien des
  replays et des ressources.
- **Durée de conservation** : un replay reste-t-il indéfiniment ? Le coût de
  stockage plaide pour une expiration, ce qui change le message affiché quand il
  n'est plus disponible.
- **Formules d'abonnement** : l'arbitrage 43 lie le téléchargement au plan de la
  communauté. Or aucune formule n'est modélisée, et le drapeau `downloadable`
  par replay des données de démonstration est donc à jeter. Tant que les plans
  n'existent pas, la règle ne peut pas se lire.

---

## 5. Console formateur

**Écrans** : `src/app/(app)/formateur/lives/` et
`.../[sessionId]/console/` · **données** : `src/features/demo/trainer-live-data.ts`

Les arbitrages 35, 36, 37 et 38 décrivaient des gestes **qui n'existaient que
côté formateur** : l'écran apprenant en montrait l'effet, il manquait la cause.
La cause est maintenant à l'écran. Chaque geste a son état correspondant chez
l'apprenant, et c'est cette correspondance que le transport temps réel devra
faire tenir.

| Geste de la console | État attendu côté apprenant |
|---|---|
| Couper tous / un / une sélection, et rouvrir | `LiveParticipant.mutedByHost` — commande micro désactivée, message d'explication |
| « Donner la parole » depuis la file numérotée | `LiveParticipant.handRaisedAt` remis à zéro **et** `mutedByHost` levé |
| Détection du locuteur, rediffusée | `LiveParticipant.speaking` — bandeau « X a la parole » |
| Enregistrement, déclenché à l'ouverture de la salle | Un replay existe pour tout live passé, daté du **jour du live** (arbitrage 34) |

### Ce qui manque techniquement

- **Le même transport temps réel que l'écran apprenant** : la console n'émet
  rien. Une coupure de micro doit voyager du formateur au participant visé, et
  la file doit être partagée — aujourd'hui chaque écran a sa copie locale.
- **La garde d'hôte** : `console/page.tsx` ne vérifie pas que le formateur
  connecté anime bien cette session. Impossible tant que `LiveSession` n'a pas
  de propriétaire ; le commentaire est en place dans le fichier.
- **La programmation d'un live** : `/formateur/lives` liste, mais ne crée rien.
  C'est le premier écrit à construire une fois le modèle posé.

### Absences volontaires — ne pas « corriger »

Trois choses manquent **par décision**, et un contributeur pressé les prendrait
pour des oublis :

- aucune commande d'exclusion dans la console (arbitrage 40) ;
- aucune file de « demandes de réouverture » séparée de la file de parole
  (arbitrage 41) ;
- aucune case « replay téléchargeable » (arbitrage 43).

### Encore à trancher

Deux questions restent ouvertes et ne se déduiront d'aucun écran : la capacité
maximale d'une session, et le sort des replays et ressources en cas de
réabonnement après une absence.

---

## Rappel de méthode

Ces écrans affichent des données de démonstration **signalées comme telles**. En
les branchant, retirer le `DemoNotice` écran par écran : c'est ce marqueur qui
distingue « pas encore câblé » de « câblé mais vide ». Voir le commentaire en
tête de `src/components/nk/demo-notice.tsx`.
