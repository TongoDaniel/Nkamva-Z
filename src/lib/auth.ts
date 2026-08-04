import type { NextAuthOptions } from 'next-auth'
import type { Role, AdminRole } from '@prisma/client'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from './db'
import { verifyPassword } from './password'
import { isSessionRevoked } from './session-validity'
import { RATE_LIMITS, clearRateLimit, ipFromHeaderRecord, peekRateLimit, recordRateLimitHit } from './rate-limit'
import { adminTwoFactorEnforced, twoFactorRequiredFor, verifySecondFactor } from './two-factor'

const LOGIN_ACTION = 'login'

/**
 * Deux compteurs, pas un : l'IP arrête le balayage d'un dictionnaire d'adresses
 * depuis un même poste, l'adresse e-mail arrête le martèlement d'un seul compte
 * depuis des IP tournantes. Le plafond sur l'IP seule laisse passer le second,
 * le plafond sur l'e-mail seul laisse passer le premier.
 */
function loginCounters(email: string, ip: string): string[] {
  return [`ip:${ip}`, `email:${email}`]
}

/**
 * Extrait du provider plutôt qu'écrit en ligne : `CredentialsProvider()` renvoie
 * un objet dont `authorize` est le stub `() => null` de NextAuth, la fonction
 * fournie n'étant lisible que sous `.options`. Un test qui appelle
 * `providers[0].authorize` teste donc le stub et passe quoi qu'il arrive.
 */
export async function authorizeCredentials(
  // `totp` n'est renseigné qu'au second passage : la première tentative se
  // solde par `TWO_FACTOR_REQUIRED`, et l'écran redemande avec le code.
  credentials: Partial<Record<'email' | 'password' | 'totp', string>> | undefined,
  // NextAuth passe son objet de requête interne (`headers`, `body`, `query`,
  // `method`) ; seuls les en-têtes servent ici.
  req?: { headers?: unknown; [key: string]: unknown },
): Promise<Record<string, unknown> | null> {
  if (!credentials?.email || !credentials?.password) return null
  const email = credentials.email.toLowerCase()
  const counters = loginCounters(email, ipFromHeaderRecord(req?.headers as Record<string, unknown> | undefined))

  // Contrôlé avant toute lecture en base : un compte inexistant doit coûter
  // aussi cher qu'un compte réel, sinon le plafond devient un oracle
  // d'énumération.
  for (const counter of counters) {
    const { allowed } = peekRateLimit(counter, LOGIN_ACTION, RATE_LIMITS.LOGIN.max, RATE_LIMITS.LOGIN.windowMs)
    if (!allowed) throw new Error('TOO_MANY_ATTEMPTS')
  }

  // Tout échec, y compris « adresse inconnue » et « compte suspendu »,
  // consomme le même quota : le plafond ne doit rien apprendre sur le compte.
  const fail = () => { for (const counter of counters) recordRateLimitHit(counter, LOGIN_ACTION, RATE_LIMITS.LOGIN.windowMs) }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true, role: true, adminRole: true, suspendedAt: true, deletedAt: true, sessionsValidAfter: true, twoFactorEnabledAt: true, trainerProfile: { select: { id: true } } },
  })
  if (!user || !user.passwordHash || user.deletedAt) { fail(); return null }
  if (user.suspendedAt) { fail(); throw new Error('ACCOUNT_SUSPENDED') }
  const valid = await verifyPassword(credentials.password, user.passwordHash)
  if (!valid) { fail(); return null }

  // Le second facteur se vérifie **ici**, avant que la session existe. Le
  // contrôler plus tard, sur un écran dédié, le rendrait décoratif : il
  // suffirait de ne pas appeler cet écran.
  if (user.twoFactorEnabledAt) {
    const code = credentials.totp?.trim()
    // Sans code, on ne compte pas d'échec : le mot de passe était bon, et
    // l'interface a seulement besoin d'apprendre qu'il lui faut une seconde
    // étape. Le pénaliser reviendrait à plafonner les connexions légitimes.
    if (!code) throw new Error('TWO_FACTOR_REQUIRED')
    if (!(await verifySecondFactor(user.id, code))) { fail(); throw new Error('TWO_FACTOR_INVALID') }
  } else if (adminTwoFactorEnforced() && twoFactorRequiredFor(user.role, user.adminRole)) {
    // Un compte d'administration sans second facteur ne se connecte pas quand
    // l'obligation est active. L'enrôlement passe par une session existante :
    // c'est pourquoi la contrainte se pose une fois les administrateurs
    // enrôlés, jamais avant.
    throw new Error('TWO_FACTOR_ENROLLMENT_REQUIRED')
  }

  // Une connexion réussie efface les échecs qui la précèdent : sinon cinq
  // fautes de frappe rattrapées bloquent la reconnexion suivante.
  for (const counter of counters) clearRateLimit(counter, LOGIN_ACTION)

  return { id: user.id, email: user.email, role: user.role, adminRole: user.adminRole, trainerId: user.trainerProfile?.id ?? null, sessionsValidAfter: user.sessionsValidAfter.toISOString() }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
        totp: { label: 'Code de vérification', type: 'text' },
      },
      authorize: (credentials, req) => authorizeCredentials(credentials, req) as any,
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/auth/connexion', error: '/auth/erreur' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id; token.role = (user as any).role; token.adminRole = (user as any).adminRole; token.trainerId = (user as any).trainerId; token.sessionsValidAfter = (user as any).sessionsValidAfter
        // `iat` est réémis par NextAuth à chaque requête : il ne peut pas servir
        // de date d'ouverture de session. On fige la nôtre à la connexion, sinon
        // la révocation par `sessionsValidAfter` ne se déclenche jamais.
        token.issuedAt = Math.floor(Date.now() / 1000)
      }
      return token
    },
    async session({ session, token }) {
      // `token.issuedAt` est figé à la connexion ; `token.iat` est réémis à chaque
      // requête. Le repli sur `iat` ne sert qu'aux jetons émis avant ce changement.
      const issuedAt = (token.issuedAt as number | undefined) ?? (token.iat as number)
      const tokenAge = Date.now() / 1000 - issuedAt

      // Rafraîchissement périodique depuis la base : c'est ce qui fait remonter
      // un changement de rôle, une suspension, ou un bump de sessionsValidAfter.
      if (tokenAge > 300) {
        const dbUser = await db.user.findUnique({ where: { id: token.userId as string }, select: { role: true, adminRole: true, suspendedAt: true, deletedAt: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } } })
        if (!dbUser || dbUser.deletedAt || dbUser.suspendedAt) return { ...session, user: undefined as any, expires: '1970-01-01T00:00:00.000Z' }
        token.role = dbUser.role; token.adminRole = dbUser.adminRole; token.trainerId = dbUser.trainerProfile?.id ?? null; token.sessionsValidAfter = dbUser.sessionsValidAfter.toISOString()
      }

      // Révocation ciblée : toute session ouverte avant le dernier bump tombe.
      // Contrôlée après le rafraîchissement, pour voir le bump du tour courant.
      if (isSessionRevoked(issuedAt, token.sessionsValidAfter as string)) {
        return { ...session, user: undefined as any, expires: '1970-01-01T00:00:00.000Z' }
      }

      return { ...session, user: { ...session.user, id: token.userId as string, role: token.role as Role, adminRole: token.adminRole as AdminRole | null, trainerId: token.trainerId as string | null } }
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
}
