import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from './db'
import { verifyPassword } from './password'

/**
 * Un jeton est révoqué s'il a été émis strictement avant la seconde où les
 * sessions ont été invalidées. L'égalité est acceptée : `iat` n'a pas la
 * précision nécessaire pour ordonner deux événements de la même seconde, et un
 * jeton n'est émis qu'après une vérification d'identifiants réussie.
 */
export function isRevoked(iatSeconds: number, sessionsValidAfter: string): boolean {
  const cutoff = Math.floor(new Date(sessionsValidAfter).getTime() / 1000)
  return iatSeconds < cutoff
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Mot de passe', type: 'password' } },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          select: { id: true, email: true, passwordHash: true, role: true, adminRole: true, suspendedAt: true, deletedAt: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
        })
        if (!user || !user.passwordHash || user.deletedAt) return null
        if (user.suspendedAt) throw new Error('ACCOUNT_SUSPENDED')
        const valid = await verifyPassword(credentials.password, user.passwordHash)
        if (!valid) return null
        return { id: user.id, email: user.email, role: user.role, adminRole: user.adminRole, trainerId: user.trainerProfile?.id ?? null, sessionsValidAfter: user.sessionsValidAfter.toISOString() } as any
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/auth/connexion', error: '/auth/erreur' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.userId = (user as any).id; token.role = (user as any).role; token.adminRole = (user as any).adminRole; token.trainerId = (user as any).trainerId; token.sessionsValidAfter = (user as any).sessionsValidAfter }
      return token
    },
    async session({ session, token }) {
      // Contrôle systématique en base plutôt que tous les 300 s.
      //
      // Le jeton transporte le `sessionsValidAfter` figé à la connexion : s'y
      // fier revenait à ignorer toute révocation pendant 5 minutes. Un
      // changement de mot de passe ne coupait donc pas les autres sessions, et
      // une suspension de compte laissait l'accès ouvert autant de temps.
      // Le coût est une lecture par clé primaire par requête authentifiée.
      const dbUser = await db.user.findUnique({
        where: { id: token.userId as string },
        select: { role: true, adminRole: true, suspendedAt: true, deletedAt: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
      })
      const revoked =
        !dbUser ||
        dbUser.deletedAt ||
        dbUser.suspendedAt ||
        // `iat` est en secondes entières, `sessionsValidAfter` en millisecondes :
        // comparer les deux tels quels rejetait tout jeton émis dans la même
        // seconde qu'une invalidation, alors qu'il venait d'être délivré après
        // une vérification d'identifiants réussie.
        isRevoked(token.iat as number, dbUser.sessionsValidAfter.toISOString())
      if (revoked) {
        return { ...session, user: undefined as any, expires: '1970-01-01T00:00:00.000Z' }
      }
      token.role = dbUser.role
      token.adminRole = dbUser.adminRole
      token.trainerId = dbUser.trainerProfile?.id ?? null
      token.sessionsValidAfter = dbUser.sessionsValidAfter.toISOString()
      return { ...session, user: { ...session.user, id: token.userId as string, role: token.role as string, adminRole: token.adminRole as string | null, trainerId: token.trainerId as string | null } }
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
}
