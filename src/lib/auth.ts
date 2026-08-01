import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from './db'
import { verifyPassword } from './password'
import { isSessionRevoked } from './session-validity'

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
      if (isSessionRevoked(token.iat as number, token.sessionsValidAfter as string)) return { ...session, user: undefined as any, expires: '1970-01-01T00:00:00.000Z' }
      const tokenAge = Date.now() / 1000 - (token.iat as number)
      if (tokenAge > 300) {
        const dbUser = await db.user.findUnique({ where: { id: token.userId as string }, select: { role: true, adminRole: true, suspendedAt: true, deletedAt: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } } })
        if (!dbUser || dbUser.deletedAt || dbUser.suspendedAt) return { ...session, user: undefined as any, expires: '1970-01-01T00:00:00.000Z' }
        token.role = dbUser.role; token.adminRole = dbUser.adminRole; token.trainerId = dbUser.trainerProfile?.id ?? null; token.sessionsValidAfter = dbUser.sessionsValidAfter.toISOString()
      }
      return { ...session, user: { ...session.user, id: token.userId as string, role: token.role as string, adminRole: token.adminRole as string | null, trainerId: token.trainerId as string | null } }
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
}
