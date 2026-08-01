/**
 * Client HTTP côté navigateur, aligné sur l'enveloppe de `src/lib/api.ts` :
 * 2xx → `{ data, meta? }` · erreur → `{ error: { code, message, details? } }`.
 */

export interface ApiErrorDetail {
  field?: string
  reason?: string
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: ApiErrorDetail[]

  constructor(code: string, message: string, status: number, details: ApiErrorDetail[] = []) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }

  /** Message d'erreur par champ, pour brancher sur un formulaire. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const d of this.details) {
      if (d.field && d.reason && !out[d.field]) out[d.field] = d.reason
    }
    return out
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Réponse sans corps JSON : on retombe sur le statut HTTP.
  }

  const body = payload as { data?: T; error?: { code: string; message: string; details?: ApiErrorDetail[] } } | null

  if (!response.ok) {
    throw new ApiError(
      body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? `Erreur ${response.status}`,
      response.status,
      body?.error?.details ?? [],
    )
  }

  return body?.data as T
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) })
}
