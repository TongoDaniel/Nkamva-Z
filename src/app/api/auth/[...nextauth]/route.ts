// Lot 0 — Point de montage NextAuth (connexion, session, déconnexion)
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
