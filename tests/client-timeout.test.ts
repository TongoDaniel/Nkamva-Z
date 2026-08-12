// ==========================================================================
// Lot 1 — le client HTTP doit toujours rendre la main
// ==========================================================================
// Tests purs : aucune base, aucun réseau, `fetch` est remplacé.
//
// Le défaut couvert ici ne se voit pas dans le code appelant : sans délai
// d'abandon, une requête partie sur un réseau qui décroche ne se règle jamais.
// Le `finally` qui éteint l'état occupé n'est alors jamais atteint, et le
// bouton tourne indéfiniment, sans message ni porte de sortie.
// ==========================================================================

import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiError, DEFAULT_TIMEOUT_MS } from '@/lib/client'

/** Réponse JSON minimale, à la forme de l'enveloppe maison. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

/**
 * `fetch` qui ne répond jamais de lui-même et ne se règle qu'à l'abandon —
 * c'est le comportement d'un vrai `fetch` interrompu par un `AbortSignal`.
 */
function hangingFetch() {
  return vi.fn((_path: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => {
        const err = new Error('The operation was aborted.')
        err.name = 'AbortError'
        reject(err)
      }
      // Comme le vrai `fetch` : un signal déjà abandonné rejette sans attendre
      // un événement `abort` qui, lui, ne sera plus jamais émis.
      if (init?.signal?.aborted) return abort()
      init?.signal?.addEventListener('abort', abort)
    })
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('délai d\'abandon', () => {
  it('abandonne une requête muette et lève un TIMEOUT', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())

    const promise = api.get('/api/me/profile')
    // Rattaché avant l'avance du temps : sinon le rejet précède le `catch`.
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'TIMEOUT',
      status: 0,
    })

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS)
    await assertion
  })

  it('ne coupe rien avant l\'échéance', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())

    let settled = false
    const promise = api.get('/api/me/profile').catch(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1_000)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1_000)
    await promise
    expect(settled).toBe(true)
  })

  it('se désactive avec timeoutMs: 0, pour les téléversements', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())

    let settled = false
    void api.post('/api/trainer/courses', {}, { timeoutMs: 0 }).catch(() => {
      settled = true
    })

    // Bien au-delà du délai par défaut : rien ne doit avoir été interrompu.
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS * 3)
    expect(settled).toBe(false)
  })
})

describe('distinction des échecs sans réponse', () => {
  it('signale une panne réseau plutôt qu\'un délai dépassé', async () => {
    // `fetch` rejette d'emblée : c'est la forme d'un échec DNS ou hors ligne.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    await expect(api.get('/api/me/profile')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    })
  })

  it('laisse remonter l\'annulation demandée par l\'appelant', async () => {
    vi.stubGlobal('fetch', hangingFetch())

    const controller = new AbortController()
    const promise = api.get('/api/me/profile', { signal: controller.signal })
    const assertion = expect(promise).rejects.toSatisfy(
      (err: unknown) =>
        // Un abandon volontaire n'est pas une panne : il ne doit pas être
        // habillé en `ApiError`, sans quoi l'appelant afficherait un message
        // d'erreur pour une navigation qu'il a lui-même interrompue.
        !(err instanceof ApiError) && (err as Error).name === 'AbortError',
    )

    controller.abort()
    await assertion
  })

  it('honore un signal déjà abandonné avant l\'appel', async () => {
    const fetchStub = hangingFetch()
    vi.stubGlobal('fetch', fetchStub)

    const controller = new AbortController()
    controller.abort()

    await expect(
      api.get('/api/me/profile', { signal: controller.signal }),
    ).rejects.toThrow()
  })
})

describe('chemin nominal', () => {
  it('rend l\'enveloppe et n\'abandonne pas une réponse arrivée', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: { id: 'u1' } })))

    const res = await api.get<{ id: string }>('/api/me/profile')
    expect(res.data).toEqual({ id: 'u1' })

    // Le minuteur est désarmé : sans le `clearTimeout`, il resterait un
    // `setTimeout` en vol après chaque requête réussie.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('conserve le code et le message d\'erreur du serveur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'ALREADY_PURCHASED', message: 'Déjà acquis.' } }, 409),
      ),
    )

    await expect(api.post('/api/purchases/initiate', {})).rejects.toMatchObject({
      code: 'ALREADY_PURCHASED',
      message: 'Déjà acquis.',
      status: 409,
    })
  })

  it('pose le content-type sur les envois avec corps, et pas sur les autres', async () => {
    const fetchStub = vi.fn(async (_path: string, _init?: RequestInit) =>
      jsonResponse({ data: null }),
    )
    vi.stubGlobal('fetch', fetchStub)

    await api.post('/api/reports', { reason: 'spam' })
    await api.get('/api/me/favorites')

    const postHeaders = fetchStub.mock.calls[0][1]?.headers as Record<string, string>
    const getHeaders = fetchStub.mock.calls[1][1]?.headers as Record<string, string>
    expect(postHeaders['content-type']).toBe('application/json')
    expect(getHeaders['content-type']).toBeUndefined()
  })
})
