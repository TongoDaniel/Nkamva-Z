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
    sessionsValidAfter: string
  }
}
