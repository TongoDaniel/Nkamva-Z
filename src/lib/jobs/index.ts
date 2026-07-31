// ==========================================================================
// Ordonnanceur des tâches planifiées (node-cron, in-process)
// ==========================================================================
// Convention Lot 0 : jobs idempotents, journalisés en audit. L'idempotence est
// portée par les jobs eux-mêmes (gardes SQL), pas par l'ordonnanceur : deux
// instances de l'application qui déclencheraient la même tâche ne peuvent pas
// produire de double effet.
// ==========================================================================

import cron from 'node-cron'
import { auditStandalone } from '../audit'
import { purgeDeletedAccounts } from './purge-deleted-accounts'
import { remindPendingDeletions } from './remind-pending-deletions'

export interface JobDefinition {
  id: string
  /** Expression cron, en UTC. */
  schedule: string
  description: string
  run: () => Promise<Record<string, unknown>>
}

export const JOBS: JobDefinition[] = [
  {
    id: 'remind-pending-deletions',
    // 07h05 UTC : le rappel arrive en matinée sur les fuseaux visés (UTC à
    // UTC+3), et bien avant la purge du lendemain matin.
    schedule: '5 7 * * *',
    description: "Prévient par e-mail avant l'effacement d'un compte (J-7 puis J-1)",
    run: async () => ({ ...(await remindPendingDeletions()) }),
  },
  {
    id: 'purge-deleted-accounts',
    // 03h17 UTC : hors des heures de pointe, et décalé d'une heure ronde pour
    // ne pas se superposer aux autres tâches planifiées à venir.
    schedule: '17 3 * * *',
    description: 'Efface les comptes dont la suppression a été demandée il y a plus de 30 jours',
    run: async () => ({ ...(await purgeDeletedAccounts()) }),
  },
]

/** Exécute un job en journalisant son issue, sans jamais laisser fuir d'erreur. */
export async function runJob(job: JobDefinition): Promise<void> {
  const startedAt = Date.now()
  try {
    const result = await job.run()
    await auditStandalone({
      actorRole: 'SYSTEM',
      action: 'SCHEDULED_JOB_COMPLETED',
      targetType: 'Job',
      targetId: job.id,
      meta: { ...result, durationMs: Date.now() - startedAt },
    })
  } catch (err) {
    console.error(`[JOB:${job.id}] échec`, err)
    // L'audit est le seul canal d'alerte : il ne doit pas emporter le process.
    await auditStandalone({
      actorRole: 'SYSTEM',
      action: 'SCHEDULED_JOB_FAILED',
      targetType: 'Job',
      targetId: job.id,
      meta: { error: String(err), durationMs: Date.now() - startedAt },
    }).catch(() => undefined)
  }
}

let started = false

/**
 * Démarre les tâches. Appelée depuis `src/instrumentation.ts`, qui peut être
 * invoquée plusieurs fois en développement : le garde évite les doublons.
 * `DISABLE_SCHEDULED_JOBS=1` les neutralise (tests, build, CI).
 */
export function startScheduledJobs(): void {
  if (started) return
  if (process.env.DISABLE_SCHEDULED_JOBS === '1') return
  started = true

  for (const job of JOBS) {
    cron.schedule(job.schedule, () => runJob(job), {
      name: job.id,
      timezone: 'UTC',
      // Une exécution longue ne doit pas se chevaucher avec la suivante.
      noOverlap: true,
    })
    console.log(`[JOB:${job.id}] planifié (${job.schedule} UTC) — ${job.description}`)
  }
}
