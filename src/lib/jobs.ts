// ==========================================================================
// Câblage node-cron des jobs planifiés (Lot 0 §6, Lot 1 §8, Lot 2 §7, Lot 3 §7)
//
// Chaque job est idempotent au niveau des données : il ne réagit qu'aux
// lignes encore en attente (filtres sur statut/date), donc une exécution
// manquée, rejouée ou chevauchante ne produit jamais de double effet. Chaque
// exécution est journalisée (SCHEDULED_JOB_COMPLETED / SCHEDULED_JOB_FAILED),
// avec noOverlap pour empêcher deux exécutions concurrentes du même job.
// ==========================================================================

import { schedule } from 'node-cron'
import { auditStandalone } from './audit'
import { expirePayoutMethodCarence, alertPayoutMethodSlaBreaches } from './payout-methods'
import { autoTimeoutDisputes } from './disputes'
import { reconcileAllWallets, alertNegativeWallets } from './wallet-reconciliation'
import { purgeExpiredTrainerDocuments } from './trainer-documents'
import { cleanupExpiredPendingAttachments } from './pending-attachments'

interface JobDefinition {
  name: string
  cron: string
  run: () => Promise<unknown>
}

const JOBS: JobDefinition[] = [
  // Lot 3 §7.1 : expiration carence 72h — horaire
  { name: 'PAYOUT_METHOD_CARENCE_EXPIRY', cron: '0 * * * *', run: expirePayoutMethodCarence },
  // Lot 3 §5.3/§7.2 : alerte SLA 48h — horaire
  { name: 'PAYOUT_METHOD_SLA_ALERT', cron: '0 * * * *', run: alertPayoutMethodSlaBreaches },
  // Lot 2 §7.1 : auto-timeout des litiges WAITING_LEARNER — horaire
  { name: 'DISPUTE_AUTO_TIMEOUT', cron: '0 * * * *', run: autoTimeoutDisputes },
  // Lot 2 §7.2 : cohérence wallet reservedBalance + pendingPayoutBalance — quotidien 03:30 UTC
  { name: 'WALLET_RECONCILIATION', cron: '30 3 * * *', run: reconcileAllWallets },
  // Lot 2 §7.3 : alerte wallet négatif > 60 jours — quotidien 03:30 UTC
  { name: 'WALLET_NEGATIVE_ALERT', cron: '30 3 * * *', run: alertNegativeWallets },
  // Lot 1 §8.1 : purge des documents formateur après 90 jours — quotidien 03:00 UTC
  { name: 'TRAINER_DOCUMENT_PURGE', cron: '0 3 * * *', run: purgeExpiredTrainerDocuments },
  // Lot 1 §8.2 : nettoyage des PendingAttachment expirés — quotidien 04:00 UTC
  { name: 'PENDING_ATTACHMENT_CLEANUP', cron: '0 4 * * *', run: cleanupExpiredPendingAttachments },
]

let started = false

export function startScheduledJobs(): void {
  if (started) return
  started = true

  for (const job of JOBS) {
    schedule(job.cron, async () => {
      const startedAt = Date.now()
      try {
        const result = await job.run()
        await auditStandalone({ action: 'SCHEDULED_JOB_COMPLETED', targetType: 'Job', targetId: job.name, meta: { durationMs: Date.now() - startedAt, result } })
      } catch (err) {
        await auditStandalone({ action: 'SCHEDULED_JOB_FAILED', targetType: 'Job', targetId: job.name, meta: { error: String(err) } })
      }
    }, { name: job.name, timezone: 'UTC', noOverlap: true, unref: true })
  }
}
