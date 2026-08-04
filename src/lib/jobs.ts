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
import { purgeDeletedAccounts } from './jobs/purge-deleted-accounts'
import { remindPendingDeletions } from './jobs/remind-pending-deletions'
import {
  renewDueSubscriptions, suspendOverdueSubscriptions, alertUpcomingSuspensions,
} from './subscriptions'
import { renewDueMemberships, expireOverdueMemberships } from './memberships'

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
  {
    // RGPD — effacement définitif des comptes au terme du délai de grâce.
    // Ferme la boucle ouverte par DELETE /api/me/deletion.
    name: 'DELETED_ACCOUNT_PURGE',
    schedule: '0 2 * * *',
    run: async () => ({ ...(await purgeDeletedAccounts()) }),
  },
  {
    // RGPD — rappels par e-mail à J-7 puis J-1 avant l'effacement.
    name: 'PENDING_DELETION_REMINDER',
    schedule: '30 2 * * *',
    run: async () => ({ ...(await remindPendingDeletions()) }),
  },
  {
    // Décisions 52/61 — renouvellement à l'échéance de chacun. Idempotent :
    // l'unicité (trainerId, periodStart) interdit de facturer deux fois.
    name: 'SUBSCRIPTION_RENEWAL',
    schedule: '0 1 * * *',
    run: async () => ({ ...(await renewDueSubscriptions()) }),
  },
  {
    // Décision 68 — au terme du délai de grâce, les ressources sortent du
    // catalogue. La lecture des apprenants n'est jamais coupée.
    name: 'SUBSCRIPTION_SUSPENSION',
    schedule: '30 1 * * *',
    run: async () => ({ ...(await suspendOverdueSubscriptions()) }),
  },
  {
    // Alerte Finances 3 jours avant la suspension : un impayé se rattrape
    // mieux avant qu'après.
    name: 'SUBSCRIPTION_SUSPENSION_ALERT',
    schedule: '45 1 * * *',
    run: async () => ({ ...(await alertUpcomingSuspensions()) }),
  },
  {
    // Adhésions aux communautés arrivées à échéance : la période suivante
    // s'ouvre et attend son règlement. Résiliations et bannissements s'y
    // referment au même passage — c'est la même échéance qui les décide.
    name: 'MEMBERSHIP_RENEWAL',
    schedule: '15 2 * * *',
    run: async () => ({ ...(await renewDueMemberships()) }),
  },
  {
    // Fin d'adhésion au terme du délai de grâce. L'accès résiduel aux
    // ressources reçues pendant l'adhésion n'est pas retiré (arbitrage 48).
    name: 'MEMBERSHIP_EXPIRY',
    schedule: '45 2 * * *',
    run: async () => ({ ...(await expireOverdueMemberships()) }),
  },
]

export async function runJob(job: ScheduledJob): Promise<void> {
  const startedAt = Date.now()
  try {
    const result = await job.run()
    await auditStandalone({
      action: 'SCHEDULED_JOB_COMPLETED',
      targetType: 'ScheduledJob', targetId: job.name,
      meta: { job: job.name, durationMs: Date.now() - startedAt, ...result },
    })
  } catch (err) {
    await auditStandalone({
      action: 'SCHEDULED_JOB_FAILED',
      targetType: 'ScheduledJob', targetId: job.name,
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
    // `noOverlap` : une exécution longue ne doit pas être doublée par le tick
    // suivant. Les jobs sont idempotents sur les données, mais deux passes
    // concurrentes se disputeraient les mêmes lignes pour rien.
    // `name` rend la tâche retrouvable via `getTasks()` ; `unref` empêche le
    // planificateur de maintenir le process en vie à lui seul.
    cron.schedule(job.schedule, () => { void runJob(job) }, {
      name: job.name, timezone: 'UTC', noOverlap: true, unref: true,
    })
  }

  console.log(`[JOBS] ${SCHEDULED_JOBS.length} jobs planifiés démarrés`)
}
