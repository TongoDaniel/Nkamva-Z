// Factures de l'utilisateur courant.
import { success, requireAuth } from '@/lib/api'
import { listMyInvoices } from '@/lib/invoices'

export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  return success(await listMyInvoices(ctx.user.id))
}
