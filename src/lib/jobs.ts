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
import { purgeExpiredTrainerDocuments } from './trainer-documents'
import { cleanupExpiredPendingAttachments } from './pending-attachments'
import { expirePayoutMethodCarence, alertPayoutMethodSlaBreaches } from './payout-methods'
import { alertPayoutSlaBreaches } from './payouts'

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
  {
    // D7 — purge des pièces d'identité 90 jours après la décision.
    name: 'TRAINER_DOCUMENT_PURGE',
    schedule: '0 3 * * *',
    run: async () => {
      const { purged } = await purgeExpiredTrainerDocuments()
      return { purged }
    },
  },
  {
    // Pièces jointes présignées jamais rattachées à un objet métier.
    name: 'PENDING_ATTACHMENT_CLEANUP',
    schedule: '0 4 * * *',
    run: async () => cleanupExpiredPendingAttachments(),
  },
  {
    // PM5 — la carence 72 h s'achève : le RIB devient VERIFIED et vaut +30 au KYC.
    name: 'PAYOUT_METHOD_CARENCE_EXPIRY',
    schedule: '15 * * * *',
    run: async () => expirePayoutMethodCarence(),
  },
  {
    // Décision 23 — SLA de revue manuelle de 48 h, moyens de paiement et retraits.
    name: 'PAYOUT_SLA_ALERT',
    schedule: '45 * * * *',
    run: async () => {
      const methods = await alertPayoutMethodSlaBreaches()
      const payouts = await alertPayoutSlaBreaches()
      return { methodsBreached: methods.breached, payoutsBreached: payouts.breached }
    },
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
