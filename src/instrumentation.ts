// Next.js instrumentation hook — appelé une fois au démarrage du serveur.
// Câble les jobs planifiés (voir lib/jobs.ts). Restreint au runtime Node (le
// runtime Edge ne supporte pas node-cron).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduledJobs } = await import('./lib/jobs')
    startScheduledJobs()
  }
}
