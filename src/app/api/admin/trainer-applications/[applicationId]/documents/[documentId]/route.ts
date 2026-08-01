// Lot 1 — Modération : consulter une pièce justificative
// §3.2 — redirection 302 vers une URL R2 signée (TTL 5 min), jamais de proxy.
// La consultation n'est journalisée qu'ici, au moment où l'URL est délivrée.
import { requireAdminSubRole, errorFromException } from '@/lib/api'
import { getDocumentViewUrl } from '@/lib/trainer-documents'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ applicationId: string; documentId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { documentId } = await params

  try {
    const { url } = await getDocumentViewUrl(documentId, {
      id: ctx.user.id,
      adminRole: ctx.user.adminRole ?? 'MODERATION',
    })
    return Response.redirect(url, 302)
  } catch (err) {
    return errorFromException(err)
  }
}
