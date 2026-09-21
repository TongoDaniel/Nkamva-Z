# Passer NKAMVA en *mobile first* — analyse préalable

> État au 14 août 2026, branche `develop` (`dbb0166`). Aucune implémentation :
> ce document sert à décider **quoi faire, dans quel ordre, et pourquoi**.
> Les mesures ont été prises sur le serveur de dev, viewport 375 × 812, avec une
> session formateur forgée (`bun scripts/smoke-session.ts formateur`).
>
> §1 à §3 : l'état de la mise en page. §4 : les règles d'expérience à tenir.
> §5 : le plan. §8 : ce qu'il faut trancher avant d'écrire une ligne.
>
> La liste des tâches qui en découle est dans
> [mobile-first-implementation.md](mobile-first-implementation.md).

---

## 1. Le point de départ n'est pas celui qu'on croit

Première conclusion, et elle change tout le plan : **l'app n'est pas cassée sur
mobile**. Elle est déjà responsive, et plutôt soigneusement.

Mesures réelles à 375 px, débordement horizontal :

| Écran | Débordement | Cibles < 44 px | Hauteur du document |
|---|---|---|---|
| `/` (vitrine) | 0 px | 0 | 7 864 px |
| `/ressources` (catalogue) | 0 px | 0 | 4 913 px |
| `/formateur` | 0 px | 4 | 2 390 px |
| `/formateur/portefeuille` | 0 px | 5 | 2 601 px |
| `/mes-achats` | 0 px | 2 | 889 px |
| `/messagerie` | 0 px | 2 | 812 px |

Et le socle mobile déjà en place, qu'il ne faut **pas** refaire :

- `viewport-fit: cover` + `env(safe-area-inset-*)` sur `.nk-wrap` ([globals.css:482](src/app/globals.css:482))
- plancher de 16 px sur les champs sous 767 px, contre le zoom iOS ([globals.css:461](src/app/globals.css:461))
- `.nk-tap` qui étend la zone sensible à 44 px sans toucher au dessin ([globals.css:398](src/app/globals.css:398))
- halo de tap Android neutralisé, blocage du défilement sous tiroir ouvert
- zoom **non** bridé — le choix WCAG 1.4.4 est déjà fait et documenté
- PWA complète : manifeste avec raccourcis et icônes maskable ([manifest.ts](src/app/manifest.ts)),
  service worker qui refuse de cacher les navigations authentifiées ([sw.js](public/sw.js)),
  page hors-ligne, invite d'installation
- tiroir de filtres mobile sur le catalogue ([catalog-controls.tsx:303](src/components/screens/catalog-controls.tsx:303))
- une sonde d'audit mobile maison ([mobile-audit.tsx](src/components/pwa/mobile-audit.tsx))

**Donc le chantier n'est pas « réparer le mobile ». C'est « faire du mobile la
référence ».** Ce sont deux travaux différents, et le second est surtout un
travail de décisions, pas de correctifs.

---

## 2. Trois lectures possibles de « mobile first » — à trancher en premier

Le mot recouvre trois ambitions de coût très différent. Il faut choisir avant
d'écrire une ligne, parce que le plan n'est pas le même.

| | Lecture | Ce que ça veut dire | Où en est NKAMVA |
|---|---|---|---|
| **A** | *CSS mobile first* | On écrit le style de base pour le téléphone, on **ajoute** avec `md:`, `lg:` | Déjà vrai à ~90 % (Tailwind l'impose), sauf 15 usages de `max-*:` qui inversent la logique |
| **B** | *UX mobile first* | Le téléphone est la maquette de référence ; le bureau s'adapte à lui, et non l'inverse. Ordre du contenu, densité, profondeur de navigation pensés pour un pouce | **Pas fait.** Tout est porté depuis une maquette bureau |
| **C** | *Produit mobile first* | L'app se comporte comme une app : barre d'onglets basse, feuilles glissantes, budget réseau, hors-ligne utile | Amorcé (PWA), mais la navigation reste celle d'un site |

Ma recommandation : **B + C**, et laisser A se faire au fil de B.

Raison : le marché visé paie en mobile money, sur des téléphones Android
d'entrée de gamme, en 3G facturée au mégaoctet. Le point A est cosmétique pour
ce public ; c'est B et C qui décident si le produit est utilisable.

**C'est le premier arbitrage à rendre** — voir §7.

---

## 3. Les écarts réels, classés par ce qu'ils coûtent

### 3.1 — Les couvertures n'ont aucune chaîne d'image *(le plus cher, et le plus récent)*

C'est le seul défaut qui coûte de l'argent réel aux utilisateurs.

- une couverture est acceptée jusqu'à **5 Mo** ([cover-uploader.tsx:14](src/app/(app)/formateur/ressources/[courseId]/cover-uploader.tsx:14))
- elle est servie **telle quelle**, en `background-image` CSS via une route de
  redirection ([cover.tsx:149](src/components/nk/cover.tsx:149))
- pas de redimensionnement, pas de `srcset`, pas de conversion WebP/AVIF
- `next.config.ts` n'a **aucune** section `images`
- 8 `<Image>` dans tout le projet, 5 `<img>` bruts

Conséquence : une carte de 160 px de haut sur un téléphone peut télécharger une
image de 5 Mo. Un catalogue de 12 cartes peut donc tirer **plusieurs dizaines de
mégaoctets** sur un forfait 3G. Et comme c'est une image de fond, elle échappe
aussi au chargement paresseux natif et à toute priorisation LCP.

Le défaut est arrivé avec `dbb0166` — il n'a pas encore essaimé, c'est le bon
moment pour le traiter.

### 3.2 — L'échelle de points de rupture n'existe pas

Sept seuils distincts cohabitent, sans source unique :

| Seuil | Ce qu'il commande | Où |
|---|---|---|
| 640 px | `max-[640px]:` (9 usages) | écrans divers |
| 767 px | plancher de 16 px sur les champs | globals.css |
| 768 px | `useIsMobile()` | [use-mobile.ts](src/hooks/use-mobile.ts) (mort — seul `ui/sidebar`, orphelin, l'appelle) |
| 820 px | bascule de la navigation principale | app-shell, public-shell |
| 860 / 861 px | barre latérale admin + blocage du défilement | admin-shell, globals.css |
| 900 px | colonne de filtres du catalogue | catalog-controls |
| `sm/md/lg/xl` | 331 usages Tailwind | partout |

Chaque écran a inventé son seuil. Tant que l'échelle n'est pas décidée, tout
nouvel écran en inventera un huitième. **C'est le prérequis technique de tout le
reste.**

À noter : sur 237 fichiers `.tsx` hors `ui/`, **146 ne portent aucune classe
responsive**. Ce n'est pas une faute en soi — beaucoup sont de petits composants
qui n'en ont pas besoin. Mais ça veut dire que la mise en page mobile repose
presque entièrement sur une poignée de coquilles et d'écrans.

### 3.3 — La navigation est celle d'un site, pas d'une app

Aujourd'hui, sur téléphone :

- un **burger en haut à droite** — la zone la plus difficile à atteindre au pouce
- un **avatar déroulant** juste à côté, qui porte 9 entrées de compte
- les 5 sections de l'espace formateur sont **dépliées dans le burger**, ce qui
  en fait une liste qui dépasse la hauteur de l'écran et défile en son sein
  ([app-shell.tsx:348](src/components/layouts/app-shell.tsx:348))
- aucune destination n'est atteignable en un geste : minimum deux appuis

Le code est propre et bien commenté — les commentaires montrent que chaque
compromis a été pesé. Mais tous ces compromis répondent à la même question :
« comment faire tenir la barre de bureau dans un téléphone ? » Un produit mobile
first pose la question inverse.

Ce que ça appelle : **une barre d'onglets basse** (3 à 5 destinations, dans la
zone du pouce, avec `nk-safe-b` qui existe déjà), et le reste dans une feuille
glissante. `vaul` est déjà installé — et inutilisé.

### 3.4 — L'ordre du contenu est hérité du bureau

- vitrine : **7 864 px** sur un écran de 812 px → ≈ 9,7 écrans à faire défiler
- catalogue : 4 913 px, premier résultat à 456 px du haut

Aucun de ces chiffres n'est aberrant en soi. Mais ils décrivent des pages dont
l'ordre des sections a été décidé pour un écran large, puis empilé. Le travail
mobile first, ici, n'est pas du CSS : c'est **re-hiérarchiser section par
section** selon l'intention mobile.

### 3.5 — `min-h-screen` au lieu de `min-h-dvh`

Les quatre coquilles (`app-shell`, `public-shell`, `admin-shell`, `auth-shell`)
et `error.tsx` utilisent `min-h-screen`, c'est-à-dire `100vh`. Sur mobile, la
barre d'adresse rend `100vh` plus grand que la hauteur visible. Le panneau du
burger, lui, utilise déjà `100dvh` — et le commentaire dit pourquoi. La règle
n'a simplement pas été généralisée. Correctif trivial, à faire en même temps que
l'unification des seuils.

### 3.6 — Deux DOM pour deux mises en page

La navigation est rendue **deux fois** (barre bureau + panneau mobile), les
filtres du catalogue **deux fois** (colonne + tiroir). Coût : un peu de charge
utile, mais surtout un **risque de divergence** — un filtre ajouté d'un côté et
pas de l'autre passe le `tsc` et ne se voit pas.

C'est exactement le patron que la mémoire projet décrit sous « deux générations
de composants ». À arbitrer : mutualiser la source des entrées (une liste, deux
rendus) plutôt que deux arbres indépendants.

### 3.7 — Cibles tactiles sous 44 px, seulement sur les écrans connectés

`.nk-tap` est utilisé 28 fois dans 16 fichiers — donc sur les boutons carrés des
coquilles, et presque nulle part ailleurs. Les écrans publics sont propres, mais
les écrans authentifiés portent des liens-actions en texte inline :

| Écran | Cible | Taille |
|---|---|---|
| `/formateur` | « Tout gérer » | 63 × 20 |
| `/formateur` | « Ouvrir le portefeuille » | 128 × 21 |
| `/formateur/portefeuille` | « Retirer un palier » | 36 × 36 |
| `/formateur/portefeuille` | « Le remplacer » | 79 × 20 |
| partout | « Aide » (pied de page) | 27 × 20 |
| partout | sélecteur d'indicatif « MT » | 64 × 42 |

Rien de bloquant, mais c'est précisément ce qu'un audit de conformité relèvera.

### 3.8 — L'admin est la seule surface franchement bureau

24 pages, barre latérale qui bascule à 861 px, `DataTable` en `min-w-[720px]`
avec défilement horizontal, table des transactions à 7 colonnes.

**Question de périmètre, pas de technique** : un admin travaille-t-il depuis un
téléphone ? Si non, il faut l'**exclure explicitement** du chantier et l'écrire,
sinon il absorbera un tiers de l'effort pour un usage nul.

### 3.9 — Aucune vérification mobile automatisée

30+ scripts de smoke existent. **Aucun ne teste un viewport mobile.** La sonde
`MobileAudit` est manuelle (`?audit=1`, dev seulement) et couvre 3 critères.

Sans garde-fou, tout ce qui sera corrigé se dégradera au prochain écran livré.

### 3.10 — Poids mort dans les dépendances

`framer-motion`, `@mdxeditor/editor`, `@tanstack/react-table` : **zéro import**.
`recharts` n'est atteint que par `ui/chart.tsx`, lui-même orphelin. 30 composants
`ui/` shadcn ne sont importés nulle part.

Ce n'est pas expédié au navigateur (le tree-shaking fait son travail), mais ça
trompe la lecture, et `vaul` — la brique exacte d'une feuille glissante — dort
dans le lot.

### 3.11 — Ce qui *n'est pas* un problème (vérifié, pour ne pas y perdre de temps)

- **le poids HTML** : `/` fait 55 Ko gzippés, `/ressources` 31 Ko (en dev). Pas un sujet.
- **le débordement horizontal** : zéro sur les six écrans mesurés.
- **le zoom iOS sur les champs** : déjà traité, plancher de 16 px vérifié.
- **le lecteur vidéo** : `playsInline` + `preload="metadata"` partout — correct.

---

## 4. Les règles d'expérience — ce qui doit rester vrai après le chantier

Une refonte mobile first se juge moins à ses media queries qu'à ce qu'elle
préserve. Cette section fixe les règles à tenir, en distinguant celles qui sont
**déjà tenues** (à ne pas casser) de celles qui **ne le sont pas encore**.

### 4.1 — Ce qui est déjà tenu, et qu'il ne faut surtout pas défaire

Le chantier « états de chargement » est allé au bout de ses quatre lots. C'est la
couche la plus coûteuse à bâtir, et elle est faite :

- `useAction` / `useKeyedAction`, délai d'abandon de 20 s sur l'API, plus un seul
  `router.refresh()` contradictoire (il y en avait 65)
- 100 `BtnLink` avec témoin d'attente ; trait de navigation qui apparaît **10 ms**
  après le clic
- barre de téléversement portée sur `XMLHttpRequest` — la seule façon de rapporter
  la progression d'un envoi
- **106 usages d'`EmptyState`** : les états vides sont traités partout

S'y ajoutent, vérifiés aujourd'hui :

- **`autoComplete="one-time-code"`** sur les 5 champs de code → l'autoremplissage
  du SMS fonctionne, ce qui est décisif quand le SMS est le second facteur
- `inputMode` sur 25 champs, `autoComplete` sur 39
- **`Reveal` dégrade proprement** : le contenu est visible par défaut, masqué
  seulement s'il est déjà sous la ligne de flottaison, et `prefers-reduced-motion`
  respecté. Un téléphone lent n'affichera jamais une page blanche.
- le service worker refuse de cacher les navigations authentifiées — pensé pour
  le **téléphone partagé**, qui est la norme sur le marché visé
- toasts en `bottom-center`, 4 s : déjà dans la zone du pouce

**Règle à écrire noir sur blanc : aucun lot mobile ne doit réintroduire un retour
contradictoire** (succès annoncé pendant que la liste montre encore l'ancien
état). C'est le défaut qui a coûté le plus cher, il était présent 63 fois.

### 4.2 — Ce qui n'est pas tenu

#### a. Le bouton retour d'Android n'est géré nulle part *(le plus grave)*

**Zéro `popstate`, zéro `history.pushState` dans tout le projet.** Le burger, le
tiroir de filtres et les modales Radix sont tous de simples `useState`.

Sur Android, le retour — bouton ou geste de bord — est le geste le plus utilisé
de l'interface. Aujourd'hui, avec une couche ouverte, il **quitte la page** au
lieu de fermer la couche. Dans une modale de formulaire, la saisie est perdue.

C'est le défaut UX mobile le plus coûteux de la liste, et il est invisible depuis
un poste de travail : au clavier, `Échap` ferme correctement (Radix s'en charge).

**Règle : toute couche qui se superpose au contenu — tiroir, modale, feuille,
filtre — doit être une entrée d'historique.** Retour = fermer la couche, jamais
quitter l'écran.

#### b. Le manifeste verrouille le portrait, l'app lit des vidéos

`orientation: "portrait-primary"` dans [manifest.ts](src/app/manifest.ts), face à
**quatre lecteurs vidéo** (cours, replay, live apprenant, console formateur). Dans
la PWA installée, le plein écran paysage — le geste naturel pour regarder un cours
— se bat contre le verrou.

**Règle : la vidéo commande l'orientation, pas le manifeste.**

#### c. Le retour depuis l'app de paiement n'est pas un signal

`refetchOnWindowFocus: false` est posé **globalement**
([providers.tsx](src/components/providers.tsx)). C'est le bon choix par défaut sur
un forfait facturé au mégaoctet — mais c'est le mauvais choix sur le seul écran où
le retour de focus est l'information la plus fiable du système : la confirmation
de paiement.

Le parcours réel : l'utilisateur quitte le navigateur, saisit son code sur l'app
mobile money ou en USSD, revient. Aujourd'hui il attend jusqu'à 8 s de plus
(`POLL_INTERVAL_MS`), et si sa saisie a pris plus de 120 s (`POLL_TIMEOUT_MS` —
plausible en USSD sur réseau lent), il retrouve un sondage arrêté.

**Règle : sur le tunnel de paiement, le retour dans l'app déclenche une
vérification immédiate, et le plafond de sondage se cale sur la latence réelle de
l'opérateur, pas sur une valeur ronde.**

#### d. Aucune remontée vers la première erreur de formulaire

Seul l'assistant `devenir-formateur` focalise son titre au changement d'étape.
Ailleurs, rien : à la soumission, une erreur située hors du champ visible reste
invisible — et sur mobile le clavier masque déjà la moitié de l'écran.

**Règle : à la soumission, le focus va au premier champ en défaut.**

#### e. `enterKeyHint` : zéro usage sur 55 champs

Le clavier mobile affiche « Entrée » là où il devrait afficher « Suivant »,
« Rechercher » ou « OK ». Correctif trivial, gain réel sur les formulaires longs
(candidature, moyen de paiement, création de ressource).

#### f. Le budget vertical n'est pas arbitré

- en-tête collant de 62 px = **7,6 %** de la hauteur d'un écran de 812 px, avant
  même la barre du navigateur
- les fils d'Ariane sont en `flex flex-wrap` : ils s'enroulent sur deux ou trois
  lignes sur un écran étroit
- `page-head` n'offre **aucun bouton retour**
- et le lot 2 va ajouter une barre d'onglets basse

Additionnés, en-tête + fil d'Ariane + barre basse peuvent manger le quart de
l'écran avant le premier contenu utile.

**Règle : plafond chiffré de chrome vertical, et sur mobile le fil d'Ariane cède
la place à un simple retour.**

#### g. Collision programmée : toasts et barre d'onglets

Les toasts sont en `bottom-center` — bon aujourd'hui, mais exactement là où la
barre d'onglets du lot 2 va se poser. **Dépendance à traiter dans le lot 2**, pas
après.

#### h. Typographie sous le seuil de confort

Corps à 15 px, et des tailles à **11, 12 et 12,5 px** mesurées sur la vitrine
(badges, mentions, libellés de section). Sur un téléphone tenu à bout de bras, en
plein soleil, 11 px n'est pas lisible — indépendamment du contraste, qui lui est
déjà validé AA.

### 4.3 — Les règles, en une liste vérifiable

À reprendre telles quelles dans `docs/decisions-nkamva.md`, et à câbler dans le
lot 4 :

1. Toute couche superposée est une entrée d'historique — retour la ferme.
2. Toute action donne un retour en moins de 100 ms, et **jamais** un retour
   contradictoire.
3. Toute destination principale est atteignable en un appui, dans le tiers bas.
4. Toute cible tactile fait au moins 44 × 44 px de zone utile.
5. Tout champ déclare son clavier : `type`, `inputMode`, `autoComplete`,
   `enterKeyHint`.
6. À la soumission, le focus va au premier champ en défaut.
7. Aucun texte porteur de sens sous 13 px.
8. Le chrome (en-tête + barre basse + fil d'Ariane) reste sous le plafond décidé.
9. Le contenu est lisible avant que le JavaScript ait fini — aucune animation
   d'apparition ne peut retenir du contenu.
10. Aucune page authentifiée n'est mise en cache — le téléphone est partagé.
11. Rien ne consomme de données sans que l'utilisateur l'ait demandé, **sauf** sur
    le tunnel de paiement, où la fraîcheur prime.

---

## 5. La méthode que je propose

L'ordre n'est pas négociable sur les deux premiers points : ils conditionnent
tout ce qui suit.

### Lot 0 — Décider (aucun code)

Trancher les arbitrages du §7. Écrire les décisions dans
`docs/decisions-nkamva.md`, qui est déjà le registre du projet. Sans ça, chaque
lot re-débat les mêmes questions.

### Lot 1 — Le socle

1. **Une échelle de points de rupture**, déclarée dans `@theme` de
   `globals.css`, et migration des 7 seuils actuels vers elle.
2. **`min-h-dvh`** dans les 4 coquilles.
3. **Chaîne d'image** : `next/image` ou route de transformation, `srcset`,
   WebP, plafond de dimension à l'upload, `remotePatterns` dans
   `next.config.ts`. C'est le lot qui rapporte le plus par heure investie.
4. **Budget mobile écrit** : Ko par écran, LCP cible sur 3G, poids maximum d'une
   couverture. Un budget non chiffré n'est pas un budget.

Livrable vérifiable : les seuils sont réduits à l'échelle décidée, et une carte
de catalogue tire une image de moins de N Ko.

### Lot 2 — La navigation *(et l'historique)*

Barre d'onglets basse + feuille glissante pour le reste, **source d'entrées
unique** partagée avec la barre de bureau. C'est le lot le plus visible et le
plus structurant ; il conditionne la mise en page de tous les écrans (padding
bas, `nk-safe-b`, zone morte sous le contenu).

Trois choses s'y raccrochent obligatoirement, sous peine d'être refaites après :

- **le bouton retour** (§4.2 a) — les couches superposées deviennent des entrées
  d'historique. C'est le même travail que la barre d'onglets : les deux touchent
  la question « où suis-je et comment j'en sors ».
- **la position des toasts** (§4.2 g) — elles se disputent le même bas d'écran.
- **le budget vertical** (§4.2 f) — en-tête, fil d'Ariane et barre basse ne se
  chiffrent qu'ensemble.

Livrable vérifiable : toute destination principale atteignable en un appui dans
le tiers bas, et le retour ne quitte jamais l'écran tant qu'une couche est
ouverte.

### Lot 3 — Les écrans, par familles

Dans cet ordre, qui suit l'argent et l'usage :

1. **parcours d'achat** — `/ressources/[slug]` → `/achat/[slug]` → confirmation
   (c'est là que le mobile money se joue ; c'est aussi là que se traite la
   reprise au retour dans l'app, §4.2 c)
2. **catalogue et recherche** — mutualiser filtres colonne/tiroir
3. **espace apprenant** — `/mes-ressources`, lecteur de cours
4. **espace formateur** — `/formateur/*`, dont les assistants de création
5. **vitrine** — re-hiérarchisation des 9,7 écrans
6. **admin** — *si et seulement si* le lot 0 l'a mis dans le périmètre

Méthode par écran : on écrit le style de base **pour 375 px**, on ajoute vers le
haut. Pas de `max-*:`. Les 15 usages existants de `max-*:` se résorbent au
passage. Et à chaque écran touché, on applique la liste du §4.3 — c'est en
passant qu'on pose `enterKeyHint`, le focus sur l'erreur et le plancher
typographique, pas dans un lot séparé qui repasserait sur les 86 pages.

### Lot 4 — Le garde-fou

- promouvoir `MobileAudit` en script de smoke non interactif, sur la liste des
  écrans du lot 3, en 375 px, avec la session forgée
- assertions structurelles : débordement = 0, cibles ≥ 44 px, champs ≥ 16 px,
  texte ≥ 13 px, poids d'image, hauteur de chrome
- assertions de comportement, plus utiles et plus faciles à régresser : le retour
  ferme la couche ouverte, chaque champ déclare son clavier, aucun `router.refresh()`
  non attendu ne réapparaît
- le brancher au même endroit que les 30 autres smokes

Sans ce lot, les trois précédents se dégradent en un trimestre — et les règles du
§4.3 ne sont que des intentions.

---

## 6. Ce qui rend ce chantier plus facile qu'il n'en a l'air

- le socle CSS mobile est **déjà là et déjà pensé** — safe areas, plancher de
  champ, `.nk-tap`, blocage de défilement. Les commentaires de `globals.css`
  montrent que les pièges connus ont été traités un par un.
- la PWA est **déjà complète**, y compris le refus délibéré de cacher les
  navigations authentifiées (partage de téléphone).
- `vaul` est installé, prêt pour les feuilles glissantes.
- une sonde d'audit existe : le lot 4 est une promotion, pas une écriture.
- l'accessibilité tactile est déjà un critère assumé (zoom non bridé, 44 px).

## 7. Ce qui le rend plus difficile qu'il n'en a l'air

- **c'est un travail de design, pas de CSS.** Re-hiérarchiser la vitrine ou
  l'espace formateur demande des décisions produit, pas des media queries.
- la duplication DOM (§3.6) veut dire que chaque écran retouché doit l'être
  **deux fois** tant que les sources ne sont pas mutualisées.
- 86 pages. Même à un rythme soutenu, le lot 3 est le gros du chantier.
- les mesures de perf réelles demandent un **build de production** — les
  chiffres de dev ci-dessus ne valent que pour la structure, pas pour le poids
  JS. À faire au début du lot 1.
- **la gestion du retour (§4.2 a) touche toutes les couches superposées à la
  fois** : burger, tiroir de filtres, six téléverseurs, toutes les modales. C'est
  peu de code, mais il doit vivre dans une primitive partagée, sinon il sera
  oublié à la première nouvelle modale.

---

## 8. Les arbitrages à rendre avant de coder

**Périmètre et structure**

1. **Quelle lecture de « mobile first »** — A, B ou B+C (§2) ?
2. **L'admin est-il dans le périmètre ?** 24 pages, usage bureau probable.
3. **L'échelle de points de rupture** : on garde `sm/md/lg/xl` de Tailwind et on
   y ramène tout, ou on déclare une échelle NKAMVA (par ex. 480 / 768 / 1024) ?
4. **Barre d'onglets basse : quelles destinations ?** 3 à 5 maximum, et elles
   diffèrent entre apprenant et formateur.
5. **Duplication DOM** : on mutualise (refonte des coquilles) ou on assume et on
   ajoute un test qui vérifie que les deux listes coïncident ?

**Expérience** *(nouveaux, issus du §4)*

6. **Le budget réseau ET le budget vertical** : quel poids maximum par écran, sur
   quel appareil de référence, sur quelle qualité de réseau — et quelle part de
   la hauteur d'écran le chrome a-t-il le droit de prendre ?
7. **L'orientation** : on retire `portrait-primary` du manifeste, ou on garde le
   verrou et on ouvre le paysage seulement en plein écran vidéo ?
8. **Le tunnel de paiement** : jusqu'où pousser le plafond de sondage de 120 s, et
   accepte-t-on d'y déroger à la règle « pas de données sans demande » en
   revérifiant au retour de focus ?
9. **Le plancher typographique** : 13 px, ou 14 px ? Le second est plus lisible
   au soleil mais retouche davantage la maquette.
10. **Le fil d'Ariane sur mobile** : on le remplace par un retour, on le tronque,
    ou on le garde tel quel en acceptant qu'il enroule ?

---

## Annexe — comment reproduire les mesures

```bash
bun scripts/smoke-session.ts formateur
```

Puis, dans le panneau navigateur : viewport 375 × 812, injection du cookie par
`document.cookie`, et la sonde de [mobile-audit.tsx](src/components/pwa/mobile-audit.tsx)
exécutée à la main via la console (débordement, cibles, champs).

Attention : une fois la session établie, NextAuth réémet le cookie en `httpOnly`
— il devient impossible d'en injecter un autre depuis le JS. Pour changer de
compte, il faut un onglet vierge ou une déconnexion. Les écrans admin de ce
document ont donc été vérifiés par `curl` avec en-tête `Cookie`, pas au
navigateur.
