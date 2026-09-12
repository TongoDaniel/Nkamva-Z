// Garde-fou du chantier mobile first.
//
// Il vérifie deux choses de nature différente, et c'est voulu :
//
//   1. **Les règles du code** — balayage statique des sources. Un seuil
//      arbitraire, un `max-*:`, un `100vh` ou un texte sous le plancher qui
//      réapparaît est une régression de règle, pas d'affichage : elle se voit
//      dans le source, sans serveur, en une seconde.
//
//   2. **Le rendu des coquilles** — requêtes HTTP contre le serveur de dev, avec
//      une session forgée. La barre d'onglets porte-t-elle les bonnes entrées
//      selon le rôle ? La place est-elle réservée sous le contenu ? Le burger
//      est-il bien mort ?
//
// Ce qu'il **ne** vérifie pas, et pourquoi : la géométrie. Une cible de 44 px ou
// un débordement horizontal ne se mesurent qu'au rendu, et le projet n'embarque
// aucune automatisation de navigateur. La sonde `src/components/pwa/mobile-audit.tsx`
// reste l'outil pour ça : `?audit=1` sur n'importe quel écran, en dev. La
// remplacer demanderait d'ajouter Playwright — décision à prendre à part.
//
//   bun scripts/smoke-mobile.ts
//
// Le serveur de dev doit tourner pour la partie 2 ; sans lui, seule la partie 1
// s'exécute et le script le dit.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const SRC = join(process.cwd(), 'src')

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? '  ok  ' : '  ÉCHEC'} ${label}${detail ? ` — ${detail}` : ''}`)
}

/* ------------------------------------------------------------------ */
/* 1. Les règles du code                                               */
/* ------------------------------------------------------------------ */

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sources(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

interface Rule {
  label: string
  pattern: RegExp
  /** Fichiers exemptés, en chemin relatif à `src/`. */
  skip?: (path: string) => boolean
  why: string
}

/**
 * `components/ui/` est la couche shadcn d'origine, largement orpheline : elle
 * n'est pas tenue par les règles du chantier tant qu'elle n'est pas rendue.
 */
const isUi = (p: string) => p.replace(/\\/g, '/').includes('components/ui/')

const RULES: Rule[] = [
  {
    label: 'aucun point de rupture arbitraire',
    pattern: /\b(min|max)-\[\d+px\]:/,
    skip: isUi,
    why: "l'échelle Tailwind est la source unique (arbitrage 110)",
  },
  {
    label: 'aucune variante descendante `max-*:`',
    pattern: /\bmax-(sm|md|lg|xl|2xl):/,
    skip: isUi,
    why: 'le style de base est écrit pour 375 px, on ajoute vers le haut',
  },
  {
    label: 'aucune hauteur en `vh`',
    pattern: /\b(min-h|max-h|h)-screen\b|\b(min-h|max-h|h)-\[\d+vh\]/,
    skip: isUi,
    why: 'la barre d’adresse mobile rend `100vh` plus grand que le visible — `dvh`',
  },
  {
    label: 'aucun texte sous le plancher de 13 px',
    pattern: /text-\[(?:[0-9]|1[0-2])(?:\.\d+)?px\]|\btext-xs\b/,
    skip: isUi,
    why: 'arbitrage 116',
  },
  {
    label: 'le nombre de `router.refresh()` ne remonte pas',
    // Le motif qui avait **63** occurrences avant le chantier « états de
    // chargement » : un `refresh()` non attendu juste après un
    // `toast.success`, qui rallumait le bouton et annonçait la réussite pendant
    // que la liste montrait encore l'ancien état.
    //
    // On ne sait pas distinguer ici un usage légitime d'un fautif : ce n'est
    // donc pas un verdict, c'est un **cliquet**. Le plafond vaut le compte du
    // jour ; s'il est dépassé, quelqu'un a rajouté un rafraîchissement et il
    // faut aller regarder s'il est attendu. Baisser ce nombre quand on en
    // supprime un est le geste qui garde le cliquet utile.
    pattern: /router\.refresh\(\)/,
    skip: () => false,
    why: 'cliquet — vérifier que le nouveau est bien attendu, puis relever le plafond',
  },
]

/** Plafond du cliquet ci-dessus, relevé le 14 août 2026. */
const REFRESH_CEILING = 14

/**
 * Le plafond, en regard du plancher typographique.
 * ==========================================================================
 * L'arbitrage 116 a posé un plancher : rien sous 13 px. Il manquait la borne
 * haute — non pas sur la taille des lettres, qui va bien (mesuré le
 * 12 septembre 2026 : titres de page à 28 px, section à 26, héros de la
 * vitrine à 34 sur deux lignes), mais sur **les espacements hérités du grand
 * écran**. Un `pt-14` écrit sans préfixe vaut 56 px à 375 px de large ; c'est
 * là que partaient les écrans : 64 px de vide en pied de chaque page, un pied
 * de page public de 835 px pour un écran de 812, cinq tuiles d'aide à 145 px.
 *
 * La règle : au-delà de 40 px (échelle 10), un espacement doit soit porter un
 * préfixe, soit voir sa chaîne de classes proposer une reprise `sm:`. Le
 * mobile d'abord, la générosité ensuite.
 *
 * C'est un **cliquet**, pas un verdict : deux occurrences restent, toutes deux
 * dans l'admin, hors périmètre du chantier (arbitrage mobile first). Si le
 * compte monte, quelqu'un a écrit une marge de grand écran sans reprise.
 */
const CEILING_MAX = 2

/** `p-10`, `mt-12`, `gap-14`… — l'échelle 10 et au-delà vaut 40 px et plus. */
const GRAND_ESPACEMENT =
  /(?<![-\w:])(?:p|px|py|pt|pb|m|mx|my|mt|mb|gap|gap-x|gap-y|space-y)-(?:1[0-9]|2[0-9]|3[0-6])(?![\w.[-])/g

function ceilingScan() {
  const hits: string[] = []
  for (const file of sources(SRC)) {
    const rel = relative(SRC, file).replace(/\\/g, '/')
    if (isUi(rel)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      // On ne lit que des chaînes de classes : un `gap-10` dans un commentaire
      // ou un nom de variable n'est pas un style.
      const chaines = [...line.matchAll(/className=(?:"([^"]*)"|\{cn\(\s*"([^"]*)")/g)].map(
        (m) => m[1] ?? m[2],
      )
      for (const chaine of chaines) {
        GRAND_ESPACEMENT.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = GRAND_ESPACEMENT.exec(chaine))) {
          const avant = chaine.slice(Math.max(0, m.index - 4), m.index)
          if (/(sm|md|lg|xl|2xl):$/.test(avant)) continue
          if (/\bsm:/.test(chaine)) continue
          hits.push(`${rel}:${i + 1} ${m[0]}`)
        }
      }
    })
  }
  check(
    `aucun espacement au-dessus de 40 px sans reprise \`sm:\` (plafond ${CEILING_MAX})`,
    hits.length <= CEILING_MAX,
    hits.length > CEILING_MAX
      ? `${hits.length} occurrence(s) — ${hits.slice(0, 4).join(', ')} — écrire la valeur mobile, puis \`sm:\` pour le grand écran`
      : '',
  )
}

function ruleScan() {
  console.log('Règles du code')
  const files = sources(SRC)
  for (const rule of RULES) {
    const hits: string[] = []
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/')
      if (rule.skip?.(rel)) continue
      const text = readFileSync(file, 'utf8')
      for (const line of text.split('\n')) {
        if (rule.pattern.test(line)) hits.push(rel)
      }
    }
    const unique = [...new Set(hits)]
    const limit = rule.label.includes('router.refresh') ? REFRESH_CEILING : 0
    check(
      rule.label,
      hits.length <= limit,
      hits.length > limit ? `${hits.length} occurrence(s) — ${unique.slice(0, 3).join(', ')} — ${rule.why}` : '',
    )
  }

  ceilingScan()

  // La primitive d'historique doit rester branchée : c'est elle qui rend le
  // bouton retour d'Android non destructeur, et rien ne le signale si elle
  // disparaît d'un composant.
  const porteurs = [
    'components/nk/modal.tsx',
    'components/nk/sheet.tsx',
    'components/layouts/app-shell.tsx',
    'components/layouts/public-shell.tsx',
    'components/layouts/admin-shell.tsx',
    'components/screens/catalog-controls.tsx',
  ]
  console.log('\nCouches superposées et historique')
  for (const rel of porteurs) {
    let text = ''
    try {
      text = readFileSync(join(SRC, rel), 'utf8')
    } catch {
      check(`${rel} existe`, false)
      continue
    }
    // Les deux coquilles publiques et connectée n'ont plus de couche à elles
    // depuis que le burger est mort : leur navigation mobile est la barre
    // d'onglets, et la feuille « Plus » porte son propre historique. C'est donc
    // l'absence de burger qu'on vérifie, pas la présence du hook.
    if (rel.endsWith('public-shell.tsx') || rel.endsWith('app-shell.tsx')) {
      check(
        `${rel} n'a plus de burger`,
        !/aria-controls="nk-(mobile|app)-nav"/.test(text),
        'la navigation mobile est la barre d’onglets',
      )
      continue
    }
    check(`${rel} branche useHistoryLayer`, text.includes('useHistoryLayer'))
  }
}

/* ------------------------------------------------------------------ */
/* 2. Le rendu des coquilles                                           */
/* ------------------------------------------------------------------ */

async function sessionCookie(kind: 'formateur' | 'apprenant') {
  const user =
    kind === 'formateur'
      ? await db.user.findFirst({
          where: { trainerProfile: { isNot: null } },
          select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : await db.user.findFirst({
          where: { trainerProfile: { is: null }, role: 'LEARNER' },
          select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
          orderBy: { createdAt: 'asc' },
        })
  if (!user) return null
  const token = await encode({
    token: {
      userId: user.id,
      role: user.role,
      adminRole: user.adminRole,
      trainerId: user.trainerProfile?.id ?? null,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
      sub: user.id,
      email: user.email,
    },
    secret: SECRET,
  })
  return `next-auth.session-token=${token}`
}

/**
 * `status: 0` quand le serveur ne répond pas du tout — `fetch` **lève** sur une
 * connexion refusée, il ne renvoie pas un code. Sans ce filet, lancer le script
 * sans serveur faisait tomber tout le garde-fou en pile d'appels, y compris la
 * partie statique qui n'a besoin de rien.
 */
async function get(path: string, cookie?: string) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: cookie ? { cookie } : {},
      redirect: 'manual',
    })
    return { status: res.status, html: res.status === 200 ? await res.text() : '' }
  } catch {
    return { status: 0, html: '' }
  }
}

/**
 * Le fragment de la barre d'onglets. Elle porte `aria-label="Navigation
 * principale"` comme la barre haute publique : on la reconnaît à sa classe
 * `nk-safe-b fixed`, qui n'appartient qu'à elle.
 */
function tabBarSlice(html: string) {
  // Ancré sur le rôle de la barre, jamais sur ses classes : « nk-safe-b fixed »
  // a suffi à faire tomber douze contrôles le jour où un utilitaire s'est
  // glissé entre les deux mots.
  const at = html.indexOf('aria-label="Navigation principale"')
  if (at === -1) return ''
  const open = html.lastIndexOf('<nav', at)
  const close = html.indexOf('</nav>', at)
  return open === -1 || close === -1 ? '' : html.slice(open, close)
}

async function renderChecks() {
  console.log('\nRendu des coquilles')

  const home = await get('/')
  if (home.status !== 200) {
    console.log(
      `  (serveur injoignable sur ${BASE}${home.status ? ` — HTTP ${home.status}` : ''} — partie 2 sautée)`,
    )
    console.log('  lancez `bun dev`, puis relancez ; les règles du code, elles, ont bien tourné.')
    return false
  }

  const visiteur = tabBarSlice(home.html)
  check('la vitrine rend une barre d’onglets', visiteur.length > 0)
  for (const label of ['Accueil', 'Catalogue', 'Communautés', 'Connexion']) {
    check(`  onglet visiteur « ${label} »`, visiteur.includes(`>${label}<`))
  }
  check('le visiteur n’a pas de « Plus »', !visiteur.includes('>Plus<'))
  check('la place est réservée sous le contenu', home.html.includes('nk-tabbar-gap'))
  check('le burger public est mort', !home.html.includes('nk-mobile-nav'))

  const manifest = await get('/manifest.webmanifest')
  check(
    'le manifeste ne verrouille plus le portrait',
    manifest.status === 200 && !manifest.html.includes('portrait-primary'),
    'arbitrage 114 — quatre lecteurs vidéo',
  )

  const cookie = await sessionCookie('formateur')
  if (!cookie) {
    check('un formateur existe dans le jeu d’essai', false, 'lancez `bun prisma/seed.ts`')
    return true
  }

  // `/formateur` et non `/accueil` : l'accueil d'un formateur **est** son
  // espace depuis que la barre n'a qu'une case pour les deux, et `/accueil` l'y
  // renvoie par une redirection — que ce contrôle suivrait sans rien vérifier.
  const accueil = await get('/formateur', cookie)
  check('/formateur répond', accueil.status === 200, `HTTP ${accueil.status}`)
  const formateur = tabBarSlice(accueil.html)
  // Les cinq cases de l'espace connecté ne portent plus de texte : leur nom vit
  // en `aria-label`. C'est lui qu'on vérifie — un onglet sans nom accessible
  // n'existe pas pour un lecteur d'écran, et rien à l'œil ne le dirait.
  // La troisième case mène à ses ressources, et le catalogue s'ouvre depuis
  // cette page : c'est la bibliothèque qu'on rouvre tous les jours, le magasin
  // qu'on visite pour acheter.
  for (const label of ['Accueil', 'Communauté', 'Mes ressources', 'Messagerie', 'Compte']) {
    check(`  onglet connecté « ${label} »`, formateur.includes(`aria-label="${label}"`))
  }
  check(
    'aucun libellé n’est rendu à l’œil dans la barre connectée',
    !/>(Accueil|Communauté|Catalogue|Messagerie|Compte)</.test(formateur),
  )
  check(
    'l’en-tête porte la cloche et le bouton publier',
    accueil.html.includes('aria-label="Publier une ressource"') &&
      /aria-label="Notifications/.test(accueil.html),
  )
  check('le burger de l’espace est mort', !accueil.html.includes('nk-app-nav'))

  return true
}

async function main() {
  console.log(`\nGarde-fou mobile — ${BASE}\n`)
  ruleScan()
  await renderChecks()
  console.log(failures === 0 ? '\nTout est vert.\n' : `\n${failures} échec(s).\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
