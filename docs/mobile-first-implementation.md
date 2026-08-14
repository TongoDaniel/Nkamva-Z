# Mobile first — liste d'implémentation

> Backlog dérivé de [mobile-first-analyse.md](mobile-first-analyse.md).
> Rien n'est encore fait : cette liste est l'inventaire du travail, pas son suivi.
> Chaque tâche porte un identifiant stable (`L1-3`), les fichiers réellement
> concernés, et une condition d'achèvement vérifiable.
>
> Taille : **S** ≤ ½ journée · **M** 1–2 jours · **L** 3–5 jours · **XL** > 1 semaine.
> Les tâches marquées **⛔** bloquent tout ce qui suit dans leur lot.

---

## Lot 0 — Décider (aucun code)

| # | Tâche | Taille | État |
|---|---|---|---|
| **L0-1** ⛔ | Trancher les 10 arbitrages du §8 de l'analyse et les consigner dans `docs/decisions-nkamva.md` | S | ✅ arbitrages 108-117 |
| **L0-2** | Mesurer un **build de production** : poids JS par route, LCP sur profil 3G, poids réel d'une page catalogue | S | ⚠️ partiel — voir ci-dessous |
| **L0-3** | Choisir l'appareil et le réseau de référence et écrire les budgets chiffrés | S | ✅ arbitrage 113 |
| **L0-4** | Recopier les 11 règles du §4.3 dans `decisions-nkamva.md` comme critères opposables | S | ✅ |

**Mesure obtenue (L0-2)** : 1 080 Ko de JS client gzippé sur 93 fragments, socle
commun de **157 Ko sur chaque page**.

**Blocage rencontré (L0-2)** : `next build` ne va pas au bout sur Windows. La
génération des 68 pages réussit, puis la copie `output: "standalone"` échoue —
un fragment Turbopack s'appelle `[externals]_node:crypto_….js`, et le
deux-points est un caractère interdit dans un nom de fichier NTFS :

```
EINVAL: invalid argument, copyfile
'.next/server/chunks/[externals]_node:crypto_c20cce38._.js'
→ '.next/standalone/.next/server/chunks/…'
```

Défaut **préexistant**, sans rapport avec le chantier mobile, mais il empêche
`bun run build` d'aboutir sur ce poste. Les chiffres ci-dessus ont donc été tirés
des artefacts (`.next/build-manifest.json` + `.next/static/chunks`), pas de la
sortie de `next build`. Le LCP réel sur profil 3G reste **non mesuré** — il le
sera au lot 4, une fois le build réparé ou mesuré depuis le serveur de staging.

**Fin de lot :** un lecteur peut répondre seul à « quel seuil ? quelles destinations dans la barre basse ? l'admin est-il concerné ? » sans rouvrir le débat.

---

## Lot 1 — Le socle technique

### Échelle de points de rupture

| # | Tâche | Fichiers | État |
|---|---|---|---|
| **L1-1** ⛔ | Déclarer l'échelle retenue dans `@theme` | `src/app/globals.css` | ✅ |
| **L1-2** | Migrer les 7 seuils arbitraires vers l'échelle | 7 fichiers | ✅ 0 `min-[Npx]:` restant |
| **L1-3** | Aligner les `@media` manuscrites sur l'échelle | `src/app/globals.css` | ✅ |
| **L1-4** | Supprimer `hooks/use-mobile.ts` (8ᵉ seuil, mort) | + `ui/sidebar.tsx` et `ui/chart.tsx`, ses seuls lecteurs, orphelins | ✅ |
| **L1-5** | Inverser les 21 usages de `max-*:` en logique ascendante | 8 fichiers | ✅ 0 `max-*:` restant hors `ui/` |

Trois règles ont changé de sens au passage, et c'est le cœur de « mobile first » :
la zone tactile de 44 px, le plancher de 16 px sur les champs et le blocage de
défilement sous tiroir sont désormais le **défaut**, retiré vers le haut, au lieu
d'exceptions mobiles greffées sur une base bureau.

Défaut trouvé en vérifiant : le plancher de 16 px retombait dès 768 px, donc une
**tablette tactile** déclenchait le zoom iOS au même titre qu'un téléphone. La
reprise est maintenant conditionnée à `pointer: fine`, pas seulement à la largeur.
Le trou existait déjà avec l'ancienne borne à 767 px — il n'était pas visible
depuis un poste de travail.

### Hauteur d'écran

| # | Tâche | Fichiers | État |
|---|---|---|---|
| **L1-6** | `min-h-screen` → `min-h-dvh` | 4 coquilles + `devenir-formateur` + `error.tsx` | ✅ vérifié au navigateur |

### Chaîne d'image

| # | Tâche | Fichiers | État |
|---|---|---|---|
| **L1-7** ⛔ | Décider du chemin | — | ✅ **ni l'un ni l'autre** — voir ci-dessous |
| **L1-8** | Variantes de largeur | — | ❌ **non fait**, voir ci-dessous |
| **L1-9** | Plafonner les dimensions au dépôt | `lib/image.ts` (nouveau) + les 2 téléverseurs | ✅ |
| **L1-10** | `Cover` en vraie image | `nk/cover.tsx` | ✅ |
| **L1-11** | Paresseux + priorité sur la première carte | `nk/resource-card.tsx` + 3 listes | ✅ |
| **L1-12** | Bannières de communauté et avatars | 3 fichiers | ✅ |

**L1-7 — le chemin retenu n'est aucun des deux proposés.** `next/image` est
écarté : la route de couverture redirige vers une **URL R2 signée à durée de vie
courte**, que l'optimiseur mettrait en cache sous une clé qui survivrait à la
signature — il servirait ensuite des 403. Une route de transformation maison est
écartée aussi : elle ferait transiter les octets par le serveur Next, ce que
l'architecture existante refuse explicitement. Aucune section `images` n'a donc
été ajoutée à `next.config.ts` : elle aurait été de la configuration morte.

À la place, la réduction se fait **avant le dépôt**, dans le navigateur du
formateur (`src/lib/image.ts`) : bornée à 1 200 px, réencodée en WebP à 0,82.
Une couverture de 5 Mo tombe autour de 150 Ko — et le formateur qui publie depuis
son téléphone n'envoie plus 5 Mo sur son propre forfait. L'objet stocké étant
borné, le quota de l'arbitrage 54 cesse aussi d'être mangé par des pixels que
personne n'affichera.

`shrinkImage` ne lève jamais : une image indécodable est déposée telle quelle.
Bloquer un dépôt parce que la réduction a échoué serait pire que le défaut qu'on
corrige.

**L1-8 reste à faire.** La carte de catalogue (262 px) et la fiche reçoivent le
même objet de 1 200 px. `Cover` ne compense pas encore par largeur. Douze cartes
tirent donc ~1,8 Mo au lieu des ~120 Ko du budget de l'arbitrage 113 : c'est
97 % de moins qu'avant le lot, mais toujours **au-dessus du budget**. La suite
demande de produire deux variantes et de les servir par `?w=`, ce qui touche le
contrat de présignature et la comptabilité du quota de stockage — un chantier à
part entière, pas une finition de ce lot.

**Vérifié au navigateur** : le repli en rayures survit au passage en `<img>`.
L'événement `error` se déclenche bien sur un objet absent, et `alt=""` fait que
l'élément ne représente rien (HTML §4.8.4.4) — les rayures du conteneur restent
visibles, ce qui était la raison du choix initial du `background-image`.

### Ménage

| # | Tâche | Fichiers | État |
|---|---|---|---|
| **L1-13** | Retirer `framer-motion`, `@mdxeditor/editor`, `@tanstack/react-table`, `recharts` — **`vaul` gardé**, requis au lot 2 | `package.json` | ✅ |
| **L1-14** | Sort des composants `ui/` orphelins | `src/components/ui/` | ⚠️ partiel — 3 supprimés (`sidebar`, `chart`, + le hook), le reste laissé en place |

**Fin de lot :** un seul jeu de seuils dans tout le code ✅, et une couverture
bornée à ~150 Ko au lieu de 5 Mo ✅ — mais le budget par écran de liste n'est pas
encore tenu (L1-8).

---

## Lot 2 — Navigation, historique et budget vertical

> Ces quatre chantiers touchent le même bas d'écran et la même question « où
> suis-je, comment j'en sors ». Les séparer garantit de refaire deux fois la
> mise en page.

### Barre d'onglets basse

| # | Tâche | Fichiers | État |
|---|---|---|---|
| **L2-1** ⛔ | Source unique des entrées de navigation | nouveau `layouts/nav-entries.ts` | ✅ |
| **L2-2** | Barre d'onglets basse | nouveau `nk/tab-bar.tsx` | ✅ |
| **L2-3** | Variantes visiteur / apprenant / formateur | `layouts/{app,public}-shell.tsx` | ✅ |
| **L2-4** | Feuille glissante « Plus » sur `vaul` | nouveau `nk/sheet.tsx` | ✅ |
| **L2-5** | Retirer le burger et son panneau | `layouts/{app,public}-shell.tsx` | ✅ |
| **L2-6** | Réserver la hauteur sous le contenu | `.nk-tabbar-gap` + les 2 coquilles | ✅ |

Mesuré à 375 px : onglets de **94 × 56** (visiteur) et **75 × 56** (formateur),
tous au-dessus de la cible de 44 px. La hauteur vit dans `--nk-tabbar-h`, lue à
la fois par la barre et par la réserve — la barre est `fixed`, donc c'est un
autre nœud qui doit garder la place, et deux nombres recopiés auraient divergé.

Sous `lg`, l'avatar de l'en-tête ne porte plus de menu déroulant : il mène au
profil, et tout le compte vit dans « Plus », à portée de pouce. Le menu
déroulant reste le rendu de bureau — mêmes entrées, même source.

### Historique et bouton retour

| # | Tâche | Fichiers | État |
|---|---|---|---|
| **L2-7** ⛔ | Primitive « couche = entrée d'historique » | nouveau `hooks/use-history-layer.ts` | ✅ |
| **L2-8** | Brancher `nk/modal.tsx` — couvre les 20 appelants | `nk/modal.tsx` | ✅ |
| **L2-9** | Brancher les 4 tiroirs maison | 3 coquilles + `catalog-controls.tsx` | ✅ |
| **L2-10** | Brancher la feuille « Plus » | `nk/sheet.tsx` | ✅ |
| **L2-11** | Aucune couche ne survit à une navigation | — | ✅ |

Trois précautions, chacune pour un piège réel : l'état de Next est **préservé**
dans l'entrée empilée (un état étranger ferait recharger la page au retour) ; la
fermeture programmatique **dépile**, sinon il faut trois retours pour quitter un
écran où l'on a ouvert trois fois la même modale ; et le dépilement est **annulé
si l'on a navigué entre-temps**, sinon une modale contenant un lien renverrait la
personne à l'écran qu'elle vient de quitter.

**Vérifié au navigateur**, modale et tiroir : le retour ferme la couche, l'URL ne
bouge pas, et fermer par `Échap` ou par la croix ramène la pile à son niveau.

Piège de vérification à retenir : dans le panneau navigateur, l'animation de
sortie de Radix ne s'achève jamais, donc le nœud reste dans le DOM après la
fermeture. Tester la présence du nœud donnait un faux échec — c'est
`data-state="closed"` qu'il faut lire.

### Budget vertical

| # | Tâche | Fichiers | État |
|---|---|---|---|
| **L2-12** | Appliquer le plafond de chrome de l'arbitrage 113 | les coquilles | ✅ mesuré 120 px / 179 px |
| **L2-13** | Retour explicite à la place du fil d'Ariane sous `md` | `nk/page-head.tsx` | ✅ |
| **L2-14** | En-tête rétractable au défilement | — | ❌ **écarté** |

**L2-14 est écartée par la mesure.** En-tête (63 px) + barre d'onglets (57 px)
font 120 px sur 812, soit **14,8 %** — le plafond de 22 % est tenu avec 59 px de
marge. Un en-tête rétractable ajouterait du mouvement et un état de défilement à
suivre pour récupérer une place dont on n'a pas besoin. À rouvrir seulement si un
écran fait passer le chrome au-dessus du plafond.

Le retour mobile et le fil d'Ariane lisent la **même** liste de miettes : le
retour vise le dernier maillon qui porte une adresse. Il n'y a pas deux vérités
sur l'endroit d'où l'on vient.

### Collisions

| # | Tâche | Fichiers | État |
|---|---|---|---|
| **L2-15** | Toasts au-dessus de la barre | `nk/toast.tsx` + `globals.css` | ✅ |
| **L2-16** | Invite d'installation et sonde d'audit | `.nk-above-tabbar` + les 2 composants | ✅ |

`mobileOffset` de sonner ne s'applique que sous 600 px, alors que la barre existe
jusqu'à 1024 px : une règle CSS couvre l'intervalle, et sert aussi aux deux
autres éléments ancrés en bas.

**Fin de lot :** toute destination principale en un appui dans le tiers bas ✅, et
le retour d'Android ne quitte jamais l'écran tant qu'une couche est ouverte ✅.

---

## Lot 3 — Les écrans (62 pages, admin retiré) — **partiel**

> **État réel : les règles transversales sont posées, les écrans ne sont pas
> repris un par un.** Ce qui est fait vaut pour tous les écrans à la fois
> (plancher typographique, focus d'erreur, clavier, orientation, historique) ;
> ce qui reste est la reprise écran par écran de la §3.1 à la §3.6, c'est-à-dire
> le gros du volume. Le détail par tâche est marqué ci-dessous.

Méthode invariante, à appliquer à chaque écran touché :

1. style de base écrit **pour 375 px**, ajouts vers le haut — jamais de `max-*:`
2. les 11 règles du §4.3 appliquées **en passant** (clavier, focus d'erreur,
   plancher typographique, cibles 44 px)
3. ordre du contenu re-hiérarchisé selon l'intention mobile, pas empilé

### 3.1 — Parcours d'achat *(en premier : c'est là que l'argent se joue)* — 4 écrans

| # | Tâche | Fichiers | État |
|---|---|---|---|
| **L3-1** | Fiche ressource | `screens/course-screen.tsx` | ⚠️ hérite du socle, pas de reprise dédiée |
| **L3-2** | Écran de paiement | `(app)/achat/[slug]/**` | ❌ non fait |
| **L3-3** | **Reprise au retour dans l'app** | `confirmation-status.tsx` | ✅ |
| **L3-4** | Adhésion communauté | `(app)/adhesion/[slug]/**` | ❌ non fait |
| **L3-5** | Champs mobile money | `nk/mobile-money-fields.tsx` | ✅ cible « MT » passée de 64×42 à conforme |

**L3-3** applique l'arbitrage 115 : plafond de sondage porté de 120 s à 300 s — une
saisie de code USSD sur réseau lent dépasse couramment deux minutes, et la
personne retrouvait un sondage **arrêté** en croyant son paiement perdu. Et
`refetchOnWindowFocus: true` sur cette seule requête, avec `staleTime: 0` : sans
ce zéro, le `staleTime` global de 30 s aurait considéré comme frais un retour
survenu juste après le dernier sondage — soit exactement le cas d'une
confirmation rapide.

### 3.2 — Catalogue et recherche — 6 écrans

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L3-6** | Mutualiser les filtres colonne / tiroir (aujourd'hui deux arbres indépendants, ~40 cases rendues deux fois) | `screens/catalog-controls.tsx` | M |
| **L3-7** | Catalogue, communautés, formateurs, recherche | `screens/{catalog,communities,trainers,trainer-directory}-screen.tsx` | L |
| **L3-8** | Pagination : cibles tactiles et position atteignable au pouce | `(app)/mes-achats/page.tsx` + 8 écrans admin paginés | S |

### 3.3 — Espace apprenant — 15 écrans

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L3-9** | Orientation : le verrou `portrait-primary` du manifeste saute | `app/manifest.ts` | ✅ arbitrage 114 |
| **L3-10** | Les 4 lecteurs profitent du déverrouillage | — | ✅ par L3-9 |
| **L3-11** | Mes ressources, mes communautés, mes achats, factures, litiges, favoris, notifications | ~10 pages sous `(app)/` | L |
| **L3-12** | Messagerie : passage deux volets → un volet sur mobile, avec retour | `messagerie/{page,conversation-pane}.tsx` | M |
| **L3-13** | Agenda des lives (`grid-cols-7` figé dès 375 px) | `mes-lives/agenda-pane.tsx` | S |

### 3.4 — Espace formateur — 14 écrans

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L3-14** | Tableau de bord + cibles tactiles relevées (« Tout gérer » 63 × 20, « Ouvrir le portefeuille » 128 × 21) | `formateur/page.tsx` | M |
| **L3-15** | Portefeuille, KYC, moyen de paiement, retraits (« Retirer/Ajouter un palier » 36 × 36) | `formateur/portefeuille/**` | L |
| **L3-16** | Création et édition de ressource — formulaire long, le plus exposé au clavier mobile | `formateur/ressources/{nouvelle,[courseId]}/**`, `course-form.tsx` | L |
| **L3-17** | Communauté, lives, litiges, abonnement | `formateur/{communaute,lives,litiges,abonnement}/**` | L |

### 3.5 — Authentification et candidature — 8 écrans

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L3-18** | Les 6 écrans `auth/*` (la saisie OTP est déjà bonne : `one-time-code` en place) | `app/auth/**` | M |
| **L3-19** | Assistant `devenir-formateur` (le seul qui focalise déjà son titre par étape — à généraliser, pas à refaire) | `devenir-formateur/trainer-signup-wizard.tsx`, `nk/wizard.tsx` | M |
| **L3-20** | Candidature formateur | `(app)/candidature/**` | M |

### 3.6 — Vitrine — 15 écrans

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L3-21** | Re-hiérarchiser la page d'accueil : 7 864 px sur un écran de 812 px, soit ≈ 9,7 écrans. Travail de design, pas de CSS | `(public)/page.tsx` (516 lignes) | L |
| **L3-22** | Tarifs, aide, contact, formateurs, communautés, légal | ~10 pages sous `(public)/` | M |

### 3.7 — Admin — ~~24 écrans~~ **retiré du périmètre**

**L3-23, L3-24 et L3-25 sont annulées** par l'arbitrage 109 : l'admin est un
usage bureau, et l'audit n'y relève aucun débordement. Ces écrans héritent
seulement de ce qui vient gratuitement avec le lot 1 (échelle de seuils, `dvh`,
chaîne d'image). `DataTable` garde son défilement horizontal.

Économie : un lot XL. À rouvrir si l'arbitrage 109 est inversé.

### 3.8 — Règles transversales

| # | Tâche | Portée | État |
|---|---|---|---|
| **L3-26** | `enterKeyHint` | défaut dans `nk/input.tsx` | ✅ |
| **L3-27** | Focus sur le premier champ en défaut | nouveau `nk/focus-first-error.tsx` | ✅ |
| **L3-28** | Compléter `inputMode` / `autoComplete` | 33 fichiers | ❌ non fait |
| **L3-29** | Plancher typographique de 13 px | 142 fichiers | ✅ |
| **L3-30** | `.nk-tap` sur les cibles sous 44 px | 5 fichiers + `globals.css` | ⚠️ écrans vérifiés |

**L3-27 est un écouteur global, pas un hook appelé 33 fois.** Un hook aurait été
oublié au 34ᵉ formulaire ; la règle est transversale et vaut pour ce qui n'existe
pas encore. Le repère est déjà uniforme — `Field` et `PasswordField` posent
`aria-invalid` dès qu'ils portent une erreur, et c'est aussi ce que lisent les
lecteurs d'écran.

Défaut trouvé en vérifiant : la première version enchaînait deux
`requestAnimationFrame`. Elle restait muette dans le panneau navigateur, **qui ne
compose pas de frames**. Le diagnostic vaut au-delà de l'outil : un onglet en
arrière-plan ne reçoit pas de frames non plus, et le focus est un comportement de
correction, pas une animation. Réécrit sur des minuteries — ce qui le rend aussi
vérifiable.

**L3-29** remonte 350 occurrences réparties sur 142 fichiers (11, 11,3, 11,5, 12,
12,3, 12,5 px et `text-xs`). Vérifié : plus aucun texte sous 13 px sur la vitrine
ni sur `/accueil`, et aucun débordement introduit.

**L3-30** est traitée sur les écrans mesurés, pas balayée à l'aveugle : une cible
ne se juge qu'au rendu. `.nk-tap` pose désormais elle-même `position: relative` —
sans repère, la zone étendue se calait sur un ancêtre quelconque, et l'oubli
était invisible puisque la zone l'est. `/accueil` et `/formateur/portefeuille` ne
comptent plus aucune cible sous 44 px.

---

## Lot 4 — Le garde-fou

| # | Tâche | Fichiers | État |
|---|---|---|---|
| **L4-1** ⛔ | Script de smoke non interactif | nouveau `scripts/smoke-mobile.ts`, `bun run check:mobile` | ✅ |
| **L4-2** | Assertions structurelles | idem | ⚠️ règles oui, géométrie non |
| **L4-3** | Assertion de comportement sur le retour | idem | ⚠️ statique seulement |
| **L4-4** | Cliquet sur `router.refresh()` | idem | ✅ |
| **L4-5** | Branché au même endroit que les autres smokes | `package.json` | ✅ |
| **L4-6** | Budgets sur build de production | — | ❌ bloqué |

**Ce que le garde-fou vérifie**, en deux parties de nature différente :

1. **Les règles du code**, par balayage statique — un seuil arbitraire, un
   `max-*:`, un `100vh` ou un texte sous le plancher qui réapparaît est une
   régression de *règle*, pas d'affichage : elle se voit dans le source, sans
   serveur, en une seconde. S'y ajoute la vérification que `useHistoryLayer`
   reste branché sur les couches superposées — rien ne signalerait sa
   disparition, et le bouton retour redeviendrait destructeur en silence.
2. **Le rendu des coquilles**, par requêtes HTTP avec session forgée — la barre
   d'onglets porte-t-elle les bonnes entrées selon le rôle, la place est-elle
   réservée, le burger est-il bien mort, le manifeste a-t-il lâché le verrou
   d'orientation.

**Ce qu'il ne vérifie pas, et pourquoi.** La géométrie : une cible de 44 px, un
débordement horizontal ou une hauteur de chrome ne se mesurent qu'au rendu, et le
projet n'embarque **aucune automatisation de navigateur**. La sonde
`src/components/pwa/mobile-audit.tsx` reste l'outil pour ça (`?audit=1` sur
n'importe quel écran, en dev). L'automatiser demanderait d'ajouter Playwright —
une décision à prendre à part, pas à glisser dans ce lot.

De même, L4-3 ne teste que la présence du branchement, pas le comportement du
retour : celui-ci a été vérifié à la main au navigateur (modale, tiroir, feuille).

**Ce que le garde-fou a trouvé à son premier passage** — quatre choses, dont
trois vraies :

- `max-h-[88vh]` dans `nk/modal.tsx` et `max-h-[70vh]` dans la sonde : le
  balayage `dvh` du lot 1 n'avait pris que `min-h-screen`, pas les hauteurs en
  `vh` arbitraires ;
- deux libellés à **9 px** dans la coquille admin, sous le radar du balayage
  typographique qui ne couvrait que 10 à 12 px ;
- une règle mal écrite de ma part (elle exigeait `useHistoryLayer` dans
  `app-shell`, qui n'a plus de couche à lui depuis que le burger est mort).

Le cliquet sur `router.refresh()` n'est pas un verdict : on ne sait pas
distinguer statiquement un usage légitime d'un fautif. C'est un plafond au compte
du jour — s'il est dépassé, quelqu'un a ajouté un rafraîchissement et il faut
aller voir s'il est attendu.

**L4-6 est bloqué** par le défaut de build Windows relevé au lot 0.

**Fin de lot :** une régression des *règles* échoue avant d'être livrée ✅ ; une
régression de *géométrie* demande encore un passage à la main.

---

## Récapitulatif

| Lot | Tâches | Poids dominant |
|---|---|---|
| 0 — Décider | 4 | Aucun code. Bloque tout. |
| 1 — Socle | 14 | La chaîne d'image (L1-7 à L1-12) |
| 2 — Navigation | 16 | Barre d'onglets + historique, indissociables |
| 3 — Écrans | 27 | **Le gros du chantier** — 62 pages (admin retiré) |
| 4 — Garde-fou | 6 | Sans lui, les trois autres se dégradent |
| **Total** | **67** | |

### Chemin critique

`L0-1` → `L1-1` (échelle) → `L2-1` (source de nav unique) → `L2-7` (primitive
d'historique) → lot 3.

Un raccourci existe si le temps manque : **L1-7 à L1-12 (image) et L2-7/L2-8
(retour sur les 20 modales via une seule primitive) sont les deux tâches qui
changent le plus l'expérience réelle pour le moins d'effort.** Elles peuvent être
livrées avant le reste, indépendamment.

### Ce qu'il ne faut pas refaire

Le chantier « états de chargement » (4 lots) est terminé, `Reveal` dégrade
correctement, l'OTP autoremplit, le service worker protège les téléphones
partagés, le socle CSS mobile est en place. Aucune tâche ci-dessus ne les
retouche — et le lot 4 existe précisément pour vérifier qu'on ne les casse pas.
