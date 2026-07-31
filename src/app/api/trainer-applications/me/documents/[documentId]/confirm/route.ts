// Lot 1 — D1 : confirmation du dépôt effectif d'une pièce
import { success, requireAuth } from '@/lib/api'
import { confirmDocumentUpload } from '@/lib/trainer-applications'
import { applicationError } from '../../../../errors'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { documentId } = await params
  try {
    return success(await confirmDocumentUpload(ctx.user.id, documentId))
  } catch (err) {
    return applicationError(err)
  }
}
