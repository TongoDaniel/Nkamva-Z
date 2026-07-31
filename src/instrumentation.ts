/**
 * Point de démarrage des tâches planifiées.
 * Next appelle `register()` une fois par processus serveur. Le garde de runtime
 * évite de charger node-cron et Prisma dans l'edge runtime, où ils ne
 * fonctionneraient pas.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { startScheduledJobs } = await import('./lib/jobs')
  startScheduledJobs()
}
