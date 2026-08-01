// Lot 0 — Point d'entrée d'instrumentation Next.js : démarre les jobs planifiés.
export async function register() {
  // Les jobs n'ont de sens que dans le runtime Node (pas Edge), et pas pendant
  // l'exécution des tests où le cron tournerait en parallèle des assertions.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_SCHEDULED_JOBS === '1') return

  const { startScheduledJobs } = await import('./lib/jobs')
  startScheduledJobs()
}
