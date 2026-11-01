import { API_URL } from './config'

/**
 * Client de l'API NKAMVA. Le serveur répond toujours `{ data, meta? }` en cas
 * de succès et `{ error: { code, message } }` sinon (`src/lib/api.ts` côté
 * site). Les messages d'erreur sont déjà rédigés pour l'utilisateur : on les
 * affiche tels quels.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export interface Page<T> {
  data: T
  meta?: Record<string, unknown>
}

let currentToken: string | null = null
let onUnauthorized: (() => void) | null = null

/** Posé par la session (`auth.tsx`) à la connexion et à la déconnexion. */
export function setApiToken(token: string | null) {
  currentToken = token
}

/** Appelé quand le serveur refuse le jeton : la session se ferme. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

const NETWORK_MESSAGE = 'Connexion impossible. Vérifie ton réseau et réessaie.'

export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<Page<T>> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const sentToken = currentToken
  if (sentToken) headers.authorization = `Bearer ${sentToken}`

  let response: Response
  try {
    response = await fetch(`${API_URL}/api/${path.replace(/^\/+/, '')}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    })
  } catch {
    throw new ApiError('NETWORK', NETWORK_MESSAGE, 0)
  }

  const json = await response.json().catch(() => null)
  if (!response.ok) {
    const error = json?.error
    // Un 401 sur une route authentifiée veut dire que le jeton ne vaut plus
    // rien (expiré, révoqué, compte suspendu). Les routes de connexion
    // renvoient aussi 401 pour un mauvais mot de passe : elles ne passent pas
    // de jeton, on ne ferme donc rien dans ce cas.
    // Seulement si le jeton refusé est toujours celui de la session : une
    // requête partie avant un changement de mot de passe revient en 401 après
    // la reconnexion, et ne doit pas fermer la nouvelle session.
    if (response.status === 401 && sentToken && sentToken === currentToken) onUnauthorized?.()
    throw new ApiError(
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? 'Une erreur est survenue. Réessaie dans un instant.',
      response.status,
    )
  }
  return json as Page<T>
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }).then((r) => r.data),
  page: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }).then((r) => r.data),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ?? {} }).then((r) => r.data),
}

/** Couverture d'une ressource : la route redirige vers l'image signée. */
export function courseCoverUrl(courseId: string) {
  return `${API_URL}/api/media/courses/${courseId}/cover`
}
