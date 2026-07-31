// Lot 1 — D1 : confirmer l'upload d'une pièce
import { success, errorFromException, requireAuth } from '@/lib/api'
import { confirmDocumentUpload, TRAINER_DOCUMENT_ERRORS } from '@/lib/trainer-documents'

export async function POST(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const { documentId } = await params

  try {
    await confirmDocumentUpload(documentId, ctx.user.id)
    return success({ confirmed: true })
  } catch (err) {
    return errorFromException(err, TRAINER_DOCUMENT_ERRORS)
  }
}
