/**
 * Vérification du jeu de démonstration : ouvre les écrans clés de chaque
 * espace et contrôle qu'ils contiennent bien ce que le seed y a mis.
 *
 *   bun prisma/seed.ts && bun run dev     # dans un autre terminal
 *   bun scripts/smoke-seed.ts
 *
 * Un 200 ne prouve rien — `error.tsx` absorbe les plantages de rendu et répond
 * quand même 200. Chaque ligne porte donc un marqueur à retrouver dans le HTML,
 * et plusieurs visent volontairement l'onglet **par défaut** d'une console :
 * un jeu de données qui laisse ce premier écran vide n'a rien montré à
 * personne.
 *
 * Les cookies sont forgés ici, comme dans `smoke-session.ts` : rien n'est écrit
 * en base, le script ne fait que lire des comptes existants.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'

const BASE = 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'

async function cookieFor(email: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
  })
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

const mail = (key: string) => `tongodanielfo+${key}@gmail.com`

interface Check { path: string; as?: string; expect: string[]; status?: number }

const CHECKS: Check[] = [
  // Public
  { path: '/', expect: ['Prêt à apprendre', 'Pipelines de données'] },
  { path: '/ressources', expect: ['Kofi Mensah', 'Modèle Notion', 'Pagination du catalogue'] },
  { path: '/ressources/grille-de-revue-de-code', expect: ['Awa Sarr', 'Acheter maintenant'] },
  // Nadège n'a rien publié : `listPublicTrainers` l'écarte, et c'est voulu —
  // une fiche formateur sans ressource n'aurait rien à montrer.
  { path: '/formateurs', expect: ['Awa Sarr', 'Kofi Mensah'] },
  { path: '/communautes', expect: ['Atelier du code', 'Cercle OHADA'] },
  { path: '/communautes/atelier-du-code', expect: ['Awa Sarr', 'membres', 'Ressources incluses'] },
  // Communauté privée : 404 pour qui n'en est ni membre ni l'animateur.
  { path: '/communautes/studio-promotion-2026', expect: [], status: 404 },
  { path: '/recherche?q=ohada', expect: ['Résultats', 'OHADA'] },

  // Apprenante
  { path: '/accueil', as: mail('aminata'), expect: ['Bonjour, Aminata', 'Architecture hexagonale'] },
  { path: '/mes-ressources', as: mail('aminata'), expect: ['Architecture hexagonale'] },
  { path: '/mes-achats', as: mail('aminata'), expect: ['FCFA'] },
  { path: '/mes-communautes', as: mail('aminata'), expect: ["L'Atelier du code"] },
  { path: '/mes-communautes/atelier-du-code', as: mail('aminata'), expect: ['Bienvenue dans l', 'migrations'] },
  { path: '/mes-lives', as: mail('aminata'), expect: ['migrations'] },
  { path: '/mes-litiges', as: mail('aminata'), expect: ['Kit identité'] },
  { path: '/messagerie', as: mail('aminata'), expect: ['Awa Sarr'] },
  { path: '/notifications', as: mail('aminata'), expect: ['NKAMVA'] },
  { path: '/favoris', as: mail('aminata'), expect: ['Tableaux de bord'] },
  { path: '/profil', as: mail('aminata'), expect: ['Aminata'] },

  // Formatrice vitrine
  { path: '/formateur', as: mail('awa'), expect: ['FCFA'] },
  { path: '/formateur/ressources', as: mail('awa'), expect: ['Architecture hexagonale', 'Observabilité'] },
  { path: '/formateur/portefeuille', as: mail('awa'), expect: ['FCFA'] },
  { path: '/formateur/portefeuille/moyen-de-paiement', as: mail('awa'), expect: ['Wave'] },
  // L'agenda est commun depuis la fusion : la formatrice y voit ses propres
  // séances, marquées, à côté de celles des communautés qu'elle suit.
  { path: '/mes-lives', as: mail('awa'), expect: ['migrations'] },
  { path: '/formateur/litiges', as: mail('awa'), expect: [''] },

  // Formateur en impayé et formatrice neuve
  { path: '/formateur', as: mail('kofi'), expect: ['FCFA'] },
  { path: '/formateur/ressources', as: mail('nadege'), expect: [''] },

  // Candidature
  { path: '/candidature/statut', as: mail('lucie'), expect: ['illisible'] },

  // Administration
  // Les consoles s'ouvrent sur un onglet filtré : les marqueurs doivent donc
  // porter sur ce que montre l'onglet par défaut, pas sur l'ensemble des
  // dossiers. Un jeu de données qui laisse ce premier onglet vide n'a rien
  // montré à personne — c'est ce que ces contrôles surveillent.
  // Le tableau de bord ne nomme personne : il compte. Le marqueur porte donc
  // sur la file, pas sur un candidat.
  { path: '/admin', as: mail('moderation'), expect: ['dossier attend votre examen'] },
  { path: '/admin/validation-formateurs', as: mail('moderation'), expect: ['Serge Abega', 'dossier'] },
  { path: '/admin/litiges', as: mail('moderation'), expect: ['Kit identité'] },
  { path: '/admin/signalements', as: mail('moderation'), expect: ['offres d'] },
  { path: '/admin/utilisateurs', as: mail('admin'), expect: ['Blaise Zongo', 'Restreint'] },
  { path: '/admin/analytics', as: mail('admin'), expect: ['Awa Sarr'] },
  { path: '/admin/transactions', as: mail('finances'), expect: ['FCFA'] },
  { path: '/admin/retraits', as: mail('finances'), expect: ['Moussa'] },
  { path: '/admin/moyens-de-paiement', as: mail('finances'), expect: ['Fatou'] },
  { path: '/admin/remboursements', as: mail('finances'), expect: ['FCFA'] },
  { path: '/admin/abonnements', as: mail('admin'), expect: ['FCFA'] },
  { path: '/admin/parametres', as: mail('admin'), expect: ['Grille 2026', 'ADEA2026'] },
  { path: '/admin/journal-audit', as: mail('admin'), expect: ['Journal'] },
]

async function main() {
  const cookies = new Map<string, string>()
  let failures = 0

  for (const check of CHECKS) {
    if (check.as && !cookies.has(check.as)) cookies.set(check.as, await cookieFor(check.as))
    const headers: Record<string, string> = check.as ? { cookie: cookies.get(check.as)! } : {}

    let status = 0
    let html = ''
    try {
      const response = await fetch(`${BASE}${check.path}`, { headers, redirect: 'manual' })
      status = response.status
      html = await response.text()
    } catch (error) {
      console.log(`✗ ${check.path} — injoignable : ${String(error).slice(0, 80)}`)
      failures++
      continue
    }

    const missing = check.expect.filter((m) => m && !html.includes(m))
    // La page d'erreur du groupe public rend un 200 : on la débusque au texte.
    const crashed = check.status !== 404 && html.includes('Une erreur est survenue')
    const statusOk = check.status ? status === check.status : status < 400
    const ok = statusOk && missing.length === 0 && !crashed

    if (ok) {
      console.log(`✓ ${status} ${check.path}${check.as ? `  (${check.as.split('+')[1].split('@')[0]})` : ''}`)
    } else {
      failures++
      console.log(
        `✗ ${status} ${check.path}${check.as ? `  (${check.as.split('+')[1].split('@')[0]})` : ''}` +
          `${crashed ? ' — page d’erreur rendue' : ''}` +
          `${missing.length ? ` — absent : ${missing.join(' | ')}` : ''}`,
      )
    }
  }

  console.log(`\n${CHECKS.length - failures}/${CHECKS.length} écrans conformes.`)
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
