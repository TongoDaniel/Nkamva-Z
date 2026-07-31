// Lot 1 — Consultation d'une pièce justificative
//
// Redirection 302 vers une URL signée de courte durée, sans proxy : le fichier
// ne transite jamais par l'application. La consultation est journalisée ici,
// seul endroit où l'on sait qu'un document est réellement ouvert.
import { requireAdminSubRole } from '@/lib/api'
import { getApplicationDetail, getDocumentViewUrl } from '@/lib/trainer-application-review'
import { reviewError } from '../../../errors'
import { error } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ applicationId: string; documentId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { applicationId, documentId } = await params

  // La pièce doit bien appartenir au dossier de l'URL : sans cette vérification,
  // un identifiant de document suffirait à lire n'importe quel dossier.
  const application = await getApplicationDetail(applicationId)
  if (!application) return error('APPLICATION_NOT_FOUND', 'Candidature introuvable.', 404)
  if (!application.documents.some((d) => d.id === documentId)) {
    return error('DOCUMENT_NOT_FOUND', 'Pièce introuvable dans ce dossier.', 404)
  }

  try {
    const { url } = await getDocumentViewUrl(documentId, ctx.user.id)
    return new Response(null, {
      status: 302,
      headers: { location: url, 'cache-control': 'no-store, private' },
    })
  } catch (err) {
    return reviewError(err)
  }
}
