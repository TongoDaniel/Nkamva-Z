// Plan d'action 1.2 : export CSV du pilotage (recettes et indicateurs,
// transactions, files), sur la période choisie. Lecture seule ; chaque export
// est tracé au journal d'audit.
import { NextResponse } from 'next/server'
import { requireAdminSubRole, error } from '@/lib/api'
import { auditStandalone } from '@/lib/audit'
import { exportTransactionsCsv, getModelMetrics, getQueueAges, parsePeriod, queuesCsv, revenueCsv } from '@/lib/pilotage'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('PILOTAGE', 'FINANCES')
  if (ctx instanceof Response) return ctx
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const period = parsePeriod(url.searchParams.get('du'), url.searchParams.get('au'))
  const span = `${period.months[0].key}_${period.months[period.months.length - 1].key}`

  let csv: string
  if (type === 'recettes') csv = revenueCsv(await getModelMetrics(period))
  else if (type === 'transactions') csv = await exportTransactionsCsv(period)
  else if (type === 'files') csv = queuesCsv(await getQueueAges())
  else return error('INVALID_EXPORT', "Type d'export inconnu.", 400)

  await auditStandalone({
    actorId: ctx.user.id, actorRole: 'ADMIN',
    action: 'PILOTAGE_EXPORTED', targetType: 'Platform', targetId: 'pilotage',
    meta: { type, from: period.months[0].key, to: period.months[period.months.length - 1].key },
  })

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nkamva-${type}-${span}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
