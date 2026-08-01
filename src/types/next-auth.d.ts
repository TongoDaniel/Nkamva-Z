// Lot 0 — Augmentation des types NextAuth : role, adminRole, trainerId
// portés par la session et le JWT (voir les callbacks de src/lib/auth.ts).
import type { Role, AdminRole } from '@prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
      adminRole: AdminRole | null
      trainerId: string | null
    } & DefaultSession['user']
  }

  // Objet renvoyé par `authorize()` du CredentialsProvider.
  interface User {
    id: string
    email: string
    role: Role
    adminRole: AdminRole | null
    trainerId: string | null
    sessionsValidAfter: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string
    role: Role
    adminRole: AdminRole | null
    trainerId: string | null
    // Sérialisé en ISO : comparé à `issuedAt` pour invalider les sessions révoquées.
    sessionsValidAfter: string
    // Date d'ouverture de session figée à la connexion. `iat` ne convient pas :
    // NextAuth réémet le JWT à chaque requête et le remet à « maintenant ».
    issuedAt: number
  }
}
