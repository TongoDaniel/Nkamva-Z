// Lot 3 — Finances : consultation d'un document d'entreprise (décision 28)
// Redirection 302 vers une URL R2 signée, journalisée au moment où l'URL est
// réellement délivrée — même règle que la consultation des pièces du Lot 1.
// Ces documents sont commerciaux (RCCM, preuve de représentation légale) et
// non des pièces d'identité : la décision 21 reste respectée, Finances n'a
// toujours accès à aucune image de PI.
import { requireAdminSubRole, error, errorFromException } from '@/lib/api'
import { getBusinessDocumentUrl, type BusinessDocumentKind } from '@/lib/payout-methods'

const KINDS: BusinessDocumentKind[] = ['BUSINESS_DOC', 'LEGAL_REP_PROOF']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ payoutMethodId: string; kind: string }> },
) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutMethodId, kind } = await params

  if (!KINDS.includes(kind as BusinessDocumentKind)) {
    return error('DOCUMENT_NOT_FOUND', 'Type de document inconnu', 404)
  }

  try {
    const { url } = await getBusinessDocumentUrl(payoutMethodId, kind as BusinessDocumentKind, {
      id: ctx.user.id,
      adminRole: ctx.user.adminRole ?? 'ADMIN',
    })
    return Response.redirect(url, 302)
  } catch (err) {
    return errorFromException(err)
  }
}
