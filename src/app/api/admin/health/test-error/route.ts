// Plan d'action 0.4 : « une erreur volontaire remonte et alerte ». Le rôle
// Technique déclenche ici une erreur de test pour vérifier, en production, que
// l'alerte arrive bien (journal, notification, e-mail, webhook).
import { requireAdminSubRole, success } from '@/lib/api'
import { reportServerError } from '@/lib/error-monitor'

export async function POST() {
  const ctx = await requireAdminSubRole('TECHNICAL')
  if (ctx instanceof Response) return ctx
  const err = new Error(`Erreur de test déclenchée volontairement (${new Date().toISOString()})`)
  await reportServerError(err, { source: 'test-error', path: '/api/admin/health/test-error', method: 'POST', force: true })
  return success({ reported: true })
}
