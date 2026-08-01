// ==========================================================================
// Jobs planifiés — câblage node-cron
// ==========================================================================
// Les effets métier de chaque job sont couverts par les suites lot1/lot2/lot3.
// Ici on ne vérifie que le câblage : un job déclaré dans SCHEDULED_JOBS mais
// jamais passé à cron ne se voit nulle part ailleurs — il ne tourne juste pas.

import { describe, it, expect } from 'vitest'
import { getTasks } from 'node-cron'
import { SCHEDULED_JOBS, startScheduledJobs } from '@/lib/jobs'

describe('Jobs planifiés — câblage node-cron', () => {
  it('enregistre chaque job déclaré, sous son nom et son pattern', () => {
    startScheduledJobs()
    const byName = new Map([...getTasks().values()].map(t => [t.name, t]))

    for (const job of SCHEDULED_JOBS) {
      const task = byName.get(job.name)
      expect(task, `le job ${job.name} devrait être enregistré`).toBeDefined()
      expect(task!.getPattern(), `pattern du job ${job.name}`).toBe(job.schedule)
    }
    expect(getTasks().size).toBe(SCHEDULED_JOBS.length)
  })

  it('est idempotent : un second appel ne duplique pas les tâches', () => {
    startScheduledJobs()
    startScheduledJobs()
    expect(getTasks().size).toBe(SCHEDULED_JOBS.length)
  })

  it('ne déclare pas deux jobs sous le même nom', () => {
    const names = SCHEDULED_JOBS.map(j => j.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
