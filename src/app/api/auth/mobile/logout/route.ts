import { success } from '@/lib/api'
import { readBearerToken, revokeMobileToken } from '@/lib/mobile-auth'

/**
 * Déconnexion de l'application mobile : le jeton porteur présenté est révoqué
 * côté serveur. Répond toujours 200, même pour un jeton déjà invalide : l'app
 * s'en va de toute façon, et la réponse n'apprend rien à qui essaierait des
 * jetons au hasard.
 */
export async function POST() {
  const raw = await readBearerToken()
  if (raw) await revokeMobileToken(raw)
  return success({ ok: true })
}
