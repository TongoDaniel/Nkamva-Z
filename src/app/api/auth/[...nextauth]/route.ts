// Lot 0 — Point de montage NextAuth v4 (App Router).
// Sert /api/auth/signin, /callback/credentials, /session, /csrf, /signout.
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
