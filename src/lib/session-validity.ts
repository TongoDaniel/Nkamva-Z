/**
 * Invalidation ciblée des sessions : un jeton émis avant `User.sessionsValidAfter`
 * ne vaut plus rien.
 *
 * `iat` est en secondes entières alors que `sessionsValidAfter` est en millisecondes :
 * on compare donc à la seconde, sinon une reconnexion dans la même seconde qu'une
 * révocation serait rejetée à tort.
 *
 * Module sans dépendance (pas de Prisma) : il est aussi importé par le middleware,
 * qui tourne sur le runtime edge.
 */
export function isSessionRevoked(iat: number | undefined, sessionsValidAfter: string | undefined): boolean {
  if (typeof iat !== 'number' || !sessionsValidAfter) return false
  return iat < Math.floor(new Date(sessionsValidAfter).getTime() / 1000)
}
