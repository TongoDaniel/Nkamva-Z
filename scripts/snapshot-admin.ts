/**
 * Instantanés HTML des écrans admin, pour audit visuel.
 *
 * Les écrans connectés ne sont pas navigables depuis le panneau navigateur.
 * On récupère donc le HTML servi côté serveur et on le dépose dans `public/`,
 * d'où il est rendu par le même serveur : les `<link>` vers la CSS compilée
 * résolvent, donc les couleurs affichées sont les vraies.
 *
 * Fichiers de travail — à supprimer après l'audit.
 *
 *   bun scripts/snapshot-admin.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { encode } from 'next-auth/jwt'
import { db } from '@/lib/db'

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3001'
const OUT = 'public/__snap'

const PAGES: Record<string, string> = {
  'tableau-de-bord': '/admin',
  parametres: '/admin/parametres',
  retraits: '/admin/retraits',
  utilisateurs: '/admin/utilisateurs',
  litiges: '/admin/litiges',
  transactions: '/admin/transactions',
  analytics: '/admin/analytics',
  'journal-audit': '/admin/journal-audit',
  signalements: '/admin/signalements',
  abonnements: '/admin/abonnements',
  'moyens-de-paiement': '/admin/moyens-de-paiement',
  'validation-formateurs': '/admin/validation-formateurs',
  administrateurs: '/admin/administrateurs',
  remboursements: '/admin/remboursements',
}

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

  await mkdir(OUT, { recursive: true })
  for (const [name, path] of Object.entries(PAGES)) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { cookie: `next-auth.session-token=${token}` },
      redirect: 'manual',
    })
    const html = await res.text()
    // Les scripts d'hydratation rejoueraient un rendu client sans session et
    // remplaceraient la page par la frontière d'erreur : on garde le HTML seul.
    const inert = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    await writeFile(`${OUT}/${name}.html`, inert)
    console.log(`${res.status}  ${path}  ->  /__snap/${name}.html  (${inert.length} o)`)
  }
  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
