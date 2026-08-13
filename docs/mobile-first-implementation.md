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

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L1-1** ⛔ | Déclarer l'échelle retenue dans `@theme` | `src/app/globals.css` | S |
| **L1-2** | Migrer les 7 seuils arbitraires vers l'échelle | `(public)/page.tsx`, `layouts/{app,public,admin}-shell.tsx`, `nk/logo.tsx`, `screens/catalog-{controls,screen}.tsx` | M |
| **L1-3** | Aligner les 3 `@media` manuscrites (767 / 860 / 860) sur l'échelle | `src/app/globals.css` | S |
| **L1-4** | Supprimer `src/hooks/use-mobile.ts` (8ᵉ seuil, mort — seul `ui/sidebar`, orphelin, l'appelle) | `hooks/use-mobile.ts` | S |
| **L1-5** | Inverser les 21 usages de `max-*:` en logique ascendante | 8 fichiers, dont `(public)/page.tsx` (8 usages) et `admin-shell.tsx` (3 lignes) | M |

### Hauteur d'écran

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L1-6** | `min-h-screen` → `min-h-dvh` (7 occurrences, 6 fichiers) | les 4 coquilles + `devenir-formateur/page.tsx` + `app/error.tsx` | S |

### Chaîne d'image — *le lot qui rapporte le plus par heure*

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L1-7** ⛔ | Décider du chemin : `next/image` avec `remotePatterns`, ou route de transformation maison devant R2 | `next.config.ts` | S |
| **L1-8** | Générer des variantes à l'upload (largeurs + WebP) plutôt que servir l'original | route de confirmation d'upload des couvertures | L |
| **L1-9** | Plafonner les dimensions à l'upload, pas seulement le poids (aujourd'hui : 5 Mo, aucune limite de pixels) | `ressources/[courseId]/cover-uploader.tsx`, `communaute/cover-uploader.tsx` | S |
| **L1-10** | Passer `Cover` de `background-image` à une vraie image avec `srcset`/`sizes`, en gardant le repli en rayures quand l'objet manque | `nk/cover.tsx` | M |
| **L1-11** | Chargement paresseux + priorité : la première carte visible est le LCP, les suivantes sont paresseuses | `nk/resource-card.tsx`, `screens/catalog-screen.tsx` | S |
| **L1-12** | Même traitement pour les couvertures de communauté et les avatars (3 `<img>` bruts) | `screens/communities-screen.tsx`, `screens/community-screen.tsx`, `nk/avatar.tsx` | M |

### Ménage

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L1-13** | Retirer les dépendances mortes : `framer-motion`, `@mdxeditor/editor`, `@tanstack/react-table`, `recharts` (0 import) — **garder `vaul`**, requis au lot 2 | `package.json` | S |
| **L1-14** | Décider du sort des ~30 composants `ui/` orphelins : supprimer ou documenter comme réserve | `src/components/ui/` | S |

**Fin de lot :** un seul jeu de seuils dans tout le code, et une carte de catalogue tire une image sous le budget de L0-3.

---

## Lot 2 — Navigation, historique et budget vertical

> Ces quatre chantiers touchent le même bas d'écran et la même question « où
> suis-je, comment j'en sors ». Les séparer garantit de refaire deux fois la
> mise en page.

### Barre d'onglets basse

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L2-1** ⛔ | Extraire la source unique des entrées de navigation (aujourd'hui dupliquée barre bureau / panneau mobile) | `layouts/app-shell.tsx`, `layouts/public-shell.tsx` | M |
| **L2-2** | Composant de barre d'onglets basse : 3–5 destinations, `nk-safe-b`, état courant, témoin d'attente `NavLink` | nouveau `nk/tab-bar.tsx` | M |
| **L2-3** | Variantes apprenant / formateur / visiteur (les destinations diffèrent) | `layouts/{app,public}-shell.tsx` | M |
| **L2-4** | Feuille glissante « Plus » pour tout ce qui ne tient pas dans la barre — sur `vaul` | nouveau `nk/sheet.tsx` | M |
| **L2-5** | Retirer le burger et le panneau mobile devenus redondants | `layouts/{app,public}-shell.tsx` | S |
| **L2-6** | Réserver la hauteur de la barre sous le contenu de tous les écrans (padding bas global) | les 4 coquilles | S |

### Historique et bouton retour

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L2-7** ⛔ | Primitive partagée « couche = entrée d'historique » (`useHistoryLayer` ou équivalent) : ouvrir pousse une entrée, retour ferme, fermer dépile | nouveau `hooks/use-history-layer.ts` | M |
| **L2-8** | Brancher `nk/modal.tsx` dessus — **couvre d'un coup les 20 fichiers appelants** | `nk/modal.tsx` | S |
| **L2-9** | Brancher les 4 tiroirs maison | `layouts/{app,public,admin}-shell.tsx`, `screens/catalog-controls.tsx` | M |
| **L2-10** | Brancher les couches restantes : `screens/schedule-live.tsx`, sélecteurs de pièces jointes, feuille « Plus » de L2-4 | 3 fichiers | S |
| **L2-11** | Vérifier qu'aucune couche ne survit à une navigation (le burger le fait déjà via `useEffect [pathname]`) | — | S |

### Budget vertical

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L2-12** | Chiffrer et appliquer le plafond de chrome décidé en L0-3 (en-tête 62 px + barre basse + fil d'Ariane) | les 4 coquilles | M |
| **L2-13** | Sur mobile, remplacer le fil d'Ariane par un retour explicite (arbitrage L0-1 n° 10) | `nk/page-head.tsx` + les écrans à fil d'Ariane | M |
| **L2-14** | Décider et implémenter le comportement de l'en-tête au défilement (fixe / rétractable) | `layouts/{app,public}-shell.tsx` | M |

### Collisions

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L2-15** | Décaler les toasts (`bottom-center`) au-dessus de la barre d'onglets | `nk/toast.tsx` | S |
| **L2-16** | Idem pour l'invite d'installation PWA et la sonde d'audit, toutes deux en `fixed bottom-0` | `pwa/install-prompt.tsx`, `pwa/mobile-audit.tsx` | S |

**Fin de lot :** toute destination principale en un appui dans le tiers bas, et le retour d'Android ne quitte jamais l'écran tant qu'une couche est ouverte.

---

## Lot 3 — Les écrans (86 pages)

Méthode invariante, à appliquer à chaque écran touché :

1. style de base écrit **pour 375 px**, ajouts vers le haut — jamais de `max-*:`
2. les 11 règles du §4.3 appliquées **en passant** (clavier, focus d'erreur,
   plancher typographique, cibles 44 px)
3. ordre du contenu re-hiérarchisé selon l'intention mobile, pas empilé

### 3.1 — Parcours d'achat *(en premier : c'est là que l'argent se joue)* — 4 écrans

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L3-1** | Fiche ressource | `(public)/ressources/[slug]/page.tsx`, `screens/course-screen.tsx` | M |
| **L3-2** | Écran de paiement | `(app)/achat/[slug]/{page,checkout-form}.tsx` | M |
| **L3-3** | **Reprise au retour dans l'app** : vérification immédiate au retour de focus sur la confirmation, et plafond de sondage recalé sur la latence opérateur réelle (aujourd'hui 8 s / 120 s, `refetchOnWindowFocus: false` global) | `achat/confirmation/[purchaseId]/confirmation-status.tsx`, `components/providers.tsx` | M |
| **L3-4** | Adhésion communauté (même tunnel) | `(app)/adhesion/[slug]/{page,adhesion-form}.tsx` | M |
| **L3-5** | Champs mobile money : cibles tactiles (sélecteur d'indicatif mesuré à 64 × 42), clavier, format | `nk/mobile-money-fields.tsx` | S |

### 3.2 — Catalogue et recherche — 6 écrans

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L3-6** | Mutualiser les filtres colonne / tiroir (aujourd'hui deux arbres indépendants, ~40 cases rendues deux fois) | `screens/catalog-controls.tsx` | M |
| **L3-7** | Catalogue, communautés, formateurs, recherche | `screens/{catalog,communities,trainers,trainer-directory}-screen.tsx` | L |
| **L3-8** | Pagination : cibles tactiles et position atteignable au pouce | `(app)/mes-achats/page.tsx` + 8 écrans admin paginés | S |

### 3.3 — Espace apprenant — 15 écrans

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L3-9** | Lecteur de cours + **orientation paysage en plein écran** (le manifeste verrouille `portrait-primary`, arbitrage L0-1 n° 7) | `mes-ressources/[courseId]/course-player.tsx`, `app/manifest.ts` | M |
| **L3-10** | Mêmes réglages d'orientation pour les 3 autres lecteurs | `mes-lives/replay/[replayId]/replay-player.tsx`, `mes-lives/live/[sessionId]/live-room.tsx`, `formateur/lives/.../live-console.tsx` | M |
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

### 3.8 — Règles transversales, appliquées au fil des écrans

| # | Tâche | Portée | Taille |
|---|---|---|---|
| **L3-26** | `enterKeyHint` sur les 55 champs (0 usage aujourd'hui) | 33 fichiers de formulaire | M |
| **L3-27** | Focus sur le premier champ en défaut à la soumission — de préférence dans une primitive partagée plutôt que 33 fois | `nk/input.tsx` ou `hooks/use-action.ts` + 33 formulaires | M |
| **L3-28** | Compléter `inputMode` / `autoComplete` (25 et 39 usages pour 55 champs) | 33 fichiers de formulaire | S |
| **L3-29** | Plancher typographique décidé en L0-1 n° 9 : reprendre les tailles à 11 / 12 / 12,5 px | vitrine + composants `nk/` | M |
| **L3-30** | Appliquer `.nk-tap` partout où une cible passe sous 44 px (28 usages aujourd'hui, dans 16 fichiers seulement) | écrans connectés surtout | M |

---

## Lot 4 — Le garde-fou

| # | Tâche | Fichiers | Taille |
|---|---|---|---|
| **L4-1** ⛔ | Promouvoir la sonde en script de smoke non interactif, en 375 px, avec session forgée — c'est une promotion, pas une écriture | `pwa/mobile-audit.tsx` → `scripts/smoke-mobile.ts` | M |
| **L4-2** | Assertions structurelles : débordement = 0, cibles ≥ 44 px, champs ≥ 16 px, texte ≥ plancher, hauteur de chrome, poids d'image | `scripts/smoke-mobile.ts` | M |
| **L4-3** | Assertion de comportement : le retour ferme la couche ouverte au lieu de quitter l'écran | `scripts/smoke-mobile.ts` | M |
| **L4-4** | Assertion de non-régression : aucun `router.refresh()` non attendu ne réapparaît (le défaut avait 63 occurrences) | test statique ou lint | S |
| **L4-5** | Lister les écrans couverts et brancher au même endroit que les 30 autres smokes | `scripts/` | S |
| **L4-6** | Vérifier le budget de L0-3 sur build de production, pas en dev | — | S |

**Fin de lot :** une régression mobile échoue en test avant d'être livrée.

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
