// ==========================================================================
// Lot 2 — Jobs planifiés (node-cron in-process)
// ==========================================================================
// Chaque job est idempotent au niveau des données (filtres sur statut/date) et
// journalise SCHEDULED_JOB_COMPLETED / SCHEDULED_JOB_FAILED.
// Démarrés depuis src/instrumentation.ts.
// ==========================================================================

import cron from 'node-cron'
import { auditStandalone } from './audit'
import { autoCloseDisputes } from './disputes'
import { reconcileAllWallets, alertNegativeWallets } from './wallet-reconciliation'

export interface ScheduledJob {
  name: string
  schedule: string
  run: () => Promise<Record<string, unknown>>
}

export const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    // T8 — litiges WAITING_LEARNER dont le délai de réponse a expiré.
    name: 'DISPUTE_AUTO_TIMEOUT',
    schedule: '0 * * * *',
    run: async () => autoCloseDisputes(),
  },
  {
    // Cohérence reservedBalance / pendingPayoutBalance (détection seule).
    name: 'WALLET_RECONCILIATION',
    schedule: '30 3 * * *',
    run: async () => {
      const { checked, discrepancies } = await reconcileAllWallets()
      return { checked, discrepancies: discrepancies.length }
    },
  },
  {
    // Décision 13 — alerte Finances sur un solde négatif > 60 jours.
    name: 'WALLET_NEGATIVE_ALERT',
    schedule: '30 3 * * *',
    run: async () => alertNegativeWallets(),
  },
]

export async function runJob(job: ScheduledJob): Promise<void> {
  const startedAt = Date.now()
  try {
    const result = await job.run()
    await auditStandalone({
      action: 'SCHEDULED_JOB_COMPLETED',
      meta: { job: job.name, durationMs: Date.now() - startedAt, ...result },
    })
  } catch (err) {
    await auditStandalone({
      action: 'SCHEDULED_JOB_FAILED',
      meta: { job: job.name, durationMs: Date.now() - startedAt, error: String(err) },
    })
  }
}

let started = false

export function startScheduledJobs(): void {
  // Un seul enregistrement par process, même en dev où le module peut être
  // réévalué par le HMR.
  if (started) return
  started = true

  for (const job of SCHEDULED_JOBS) {
    cron.schedule(job.schedule, () => { void runJob(job) }, { timezone: 'UTC' })
  }

  console.log(`[JOBS] ${SCHEDULED_JOBS.length} jobs planifiés démarrés`)
}
