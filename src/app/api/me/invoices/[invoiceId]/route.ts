// Une facture — sa fiche, ou son PDF avec `?pdf=1`.
//
// Le PDF est rendu à la demande et non stocké : aucune de ses données ne peut
// bouger, deux rendus donnent la même pièce.
import { error, success, requireAuth, errorFromException } from '@/lib/api'
import { getInvoice, renderInvoicePdf } from '@/lib/invoices'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { invoiceId } = await params
  const wantsPdf = new URL(request.url).searchParams.get('pdf') === '1'

  try {
    if (!wantsPdf) return success(await getInvoice(invoiceId, ctx.user.id))

    const invoice = await getInvoice(invoiceId, ctx.user.id)
    const pdf = await renderInvoicePdf(invoiceId, ctx.user.id)
    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="facture-${invoice.number}.pdf"`,
        // Une facture ne change pas : elle peut se garder longtemps. Privé,
        // parce qu'elle nomme son destinataire.
        'cache-control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    return errorFromException(err)
  }
}
