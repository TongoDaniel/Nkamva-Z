// Lot 1 — Confirmer le dépôt d'une pièce (D1) : vérification du magic number
import { success, requireAuth, errorFromException } from '@/lib/api'
import { confirmDocumentUpload } from '@/lib/trainer-documents'

export async function POST(_req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const { documentId } = await params

  try {
    return success(await confirmDocumentUpload(ctx.user.id, documentId))
  } catch (err) {
    return errorFromException(err)
  }
}
