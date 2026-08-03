/**
 * Forge un cookie de session NextAuth pour un smoke test manuel.
 *
 * À lancer depuis la racine du projet — le script doit vivre ici, et non dans
 * un dossier temporaire, pour que `@/…` et `next-auth/jwt` se résolvent :
 *
 *   bun scripts/smoke-session.ts formateur
 *   bun scripts/smoke-session.ts <email>
 *
 * Il n'écrit rien en base : il lit un utilisateur existant et imprime le
 * cookie à coller dans un `curl` ou dans le navigateur.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'

const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'

async function main() {
  const arg = process.argv[2] ?? 'formateur'

  const user =
    arg === 'formateur'
      ? await db.user.findFirst({
          where: { trainerProfile: { isNot: null } },
          select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : await db.user.findUnique({
          where: { email: arg },
          select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
        })

  if (!user) {
    console.error(`Aucun utilisateur trouvé pour « ${arg} ». Lancez d'abord \`bun prisma/seed.ts\`.`)
    process.exit(1)
  }

  const token = await encode({
    token: {
      userId: user.id,
      role: user.role,
      adminRole: user.adminRole,
      trainerId: user.trainerProfile?.id ?? null,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
      // Champs standards attendus par NextAuth dans le JWT de session.
      sub: user.id,
      email: user.email,
    },
    secret: SECRET,
  })

  console.log(JSON.stringify({
    email: user.email,
    trainerId: user.trainerProfile?.id ?? null,
    cookie: `next-auth.session-token=${token}`,
  }, null, 2))
}

main().finally(() => db.$disconnect())
