/**
 * Smoke — l'accent vert du back-office.
 *
 * Vérifie sur le HTML *servi* (et non sur le JSX) que la coquille admin porte
 * bien `.nk-admin`, et qu'aucune teinte bleue de marque ne subsiste en dur dans
 * le balisage rendu. Le contrôle des couleurs calculées, lui, se fait dans le
 * navigateur : un `class=` ne dit pas quelle valeur `--brand` prend.
 *
 *   bun scripts/smoke-admin-accent.ts
 */
import { encode } from 'next-auth/jwt'
import { db } from '@/lib/db'

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3001'

// `/admin/mon-compte` n'existe pas : le compte d'un admin passe par `/profil`,
// dans la coquille applicative — donc en bleu, et c'est voulu.
const PAGES = [
  '/admin',
  '/admin/parametres',
  '/admin/retraits',
  '/admin/utilisateurs',
  '/admin/validation-formateurs',
  '/admin/litiges',
  '/admin/transactions',
  '/admin/analytics',
  '/admin/journal-audit',
  '/admin/signalements',
  '/admin/abonnements',
  '/admin/moyens-de-paiement',
  '/admin/administrateurs',
  '/admin/remboursements',
]

/** Teintes bleues de marque : elles ne doivent plus apparaître dans l'admin. */
const BLUES = [/#1c5ed0/gi, /#144aa8/gi, /#e4ecf9/gi, /#d0dff5/gi, /#2e7cf6/gi, /28,\s*94,\s*208/g]

async function main() {
  const admin = await db.user.findFirstOrThrow({
    where: { role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true },
  })

  const token = await encode({
    token: {
      userId: admin.id,
      email: admin.email,
      role: admin.role,
      adminRole: admin.adminRole,
      trainerId: null,
      sessionsValidAfter: admin.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  const cookie = `next-auth.session-token=${token}`

  let failures = 0
  for (const path of PAGES) {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: 'manual' })
    const html = res.status === 200 ? await res.text() : ''

    // `nk-admin` doit être dans un attribut `class`, pas seulement dans l'`id`
    // de la navigation (`nk-admin-nav`), qui n'a rien à voir avec l'accent.
    const scoped = /class="[^"]*\bnk-admin\b[^"]*"/.test(html)
    const blues = BLUES.flatMap((re) => html.match(re) ?? [])
    const ok = res.status === 200 && scoped && blues.length === 0
    if (!ok) failures++

    console.log(
      `${ok ? 'ok  ' : 'KO  '}${path.padEnd(32)} ${res.status}` +
        `  scope:${scoped ? 'oui' : 'NON'}` +
        `  bleus:${blues.length ? [...new Set(blues)].join(',') : 'aucun'}`,
    )
  }

  console.log(failures ? `\n${failures} page(s) en défaut` : '\ntoutes les pages admin sont vertes')
  await db.$disconnect()
  process.exit(failures ? 1 : 0)
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
