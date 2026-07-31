// Lot 1 — §5.3 : consulter une pièce d'identité (302 + audit TRAINER_DOCUMENT_VIEW)
// FINANCES n'a JAMAIS accès (décision n°7) — requireAdminSubRole ne liste pas FINANCES ici.
import { errorFromException, requireAdminSubRole } from '@/lib/api'
import { getDocumentDownloadRedirect, TRAINER_DOCUMENT_ERRORS } from '@/lib/trainer-documents'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { documentId } = await params

  try {
    const url = await getDocumentDownloadRedirect(documentId, ctx.user.id)
    return new Response(null, { status: 302, headers: { Location: url } })
  } catch (err) {
    return errorFromException(err, TRAINER_DOCUMENT_ERRORS)
  }
}
