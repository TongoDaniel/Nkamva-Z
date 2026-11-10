// Lot 0 — Point d'entrée d'instrumentation Next.js : démarre les jobs planifiés.
export async function register() {
  // Les jobs n'ont de sens que dans le runtime Node (pas Edge), et pas pendant
  // l'exécution des tests où le cron tournerait en parallèle des assertions.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_SCHEDULED_JOBS === '1') return

  const { startScheduledJobs } = await import('./lib/jobs')
  startScheduledJobs()
}

/**
 * Plan d'action 0.4 : toute erreur serveur capturée par Next.js (rendu, route,
 * action) remonte à la surveillance : journal, audit, alerte du rôle Technique.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { reportServerError } = await import('./lib/error-monitor')
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : null
  await reportServerError(err, {
    source: `${context.routeType}:${context.routePath}`,
    path: request.path,
    method: request.method,
    digest,
  })
}
