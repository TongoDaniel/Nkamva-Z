// ==========================================================================
// Client HTTP front — enveloppe { data, meta? } / { error: { code, message } }
// ==========================================================================

export interface ApiMeta {
  total?: number;
  page?: number;
  pageSize?: number;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Array<{ field?: string; reason?: string }>;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: Array<{ field?: string; reason?: string }>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Délai au-delà duquel une requête est abandonnée.
 *
 * Sans lui, `fetch` attend indéfiniment : sur un réseau qui décroche en cours
 * de route, la promesse ne se règle jamais, le `finally` qui éteint l'état
 * occupé n'est jamais atteint, et le bouton reste à tourner sans issue ni
 * message. Vingt secondes laissent largement passer l'appel le plus lent
 * (`/api/purchases/initiate`, qui ouvre la session chez Stripe ou PawaPay).
 */
export const DEFAULT_TIMEOUT_MS = 20_000;

export interface ApiInit extends RequestInit {
  /** Délai avant abandon, en ms. `0` le désactive (téléversements). */
  timeoutMs?: number;
}

/** Échecs sans réponse HTTP : `status` vaut 0, il n'y a rien à interpréter. */
export const TIMEOUT_MESSAGE =
  "La connexion est trop lente. Vérifiez votre réseau, puis réessayez.";
export const NETWORK_MESSAGE =
  "Connexion interrompue. Vérifiez votre réseau, puis réessayez.";

async function request<T>(
  path: string,
  init?: ApiInit,
): Promise<{ data: T; meta?: ApiMeta }> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = init ?? {};

  // Contrôleur monté à la main plutôt que `AbortSignal.timeout` composé par
  // `AbortSignal.any` : ces deux-là manquent aux WebView Android encore en
  // service chez une partie du public visé, où ils lèveraient à l'appel.
  // Signal déjà abandonné : on ne part pas. `fetch` rejetterait de lui-même,
  // mais le court-circuit évite d'ouvrir une connexion pour rien et rend le
  // comportement indépendant de l'implémentation de `fetch`.
  if (callerSignal?.aborted) {
    throw callerSignal.reason ?? new DOMException("Requête annulée.", "AbortError");
  }

  const controller = new AbortController();
  let timedOut = false;

  const relayAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", relayAbort, { once: true });

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    let res: Response;
    try {
      res = await fetch(path, {
        ...rest,
        signal: controller.signal,
        headers: {
          ...(rest.body ? { "content-type": "application/json" } : {}),
          ...rest.headers,
        },
      });
    } catch (err) {
      if (timedOut) throw new ApiError("TIMEOUT", TIMEOUT_MESSAGE, 0);
      // Annulation demandée par l'appelant : on laisse remonter l'`AbortError`
      // tel quel, c'est un abandon volontaire et non une panne à signaler.
      if (callerSignal?.aborted) throw err;
      throw new ApiError("NETWORK_ERROR", NETWORK_MESSAGE, 0);
    }

    // Le corps compte dans le délai : une réponse dont les en-têtes arrivent
    // puis dont le flux se tarit bloquerait tout autant qu'une requête muette.
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Réponse sans corps JSON (204, erreur réseau côté proxy…), ou lecture
      // interrompue — les deux cas se départagent juste en dessous.
      if (timedOut) throw new ApiError("TIMEOUT", TIMEOUT_MESSAGE, 0);
      if (callerSignal?.aborted) throw new ApiError("NETWORK_ERROR", NETWORK_MESSAGE, 0);
    }

    if (!res.ok) {
      const err = (body as { error?: { code?: string; message?: string; details?: never } })?.error;
      throw new ApiError(
        err?.code ?? "UNKNOWN_ERROR",
        err?.message ?? "Une erreur est survenue. Réessayez dans un instant.",
        res.status,
        err?.details,
      );
    }

    return body as { data: T; meta?: ApiMeta };
  } finally {
    if (timer) clearTimeout(timer);
    callerSignal?.removeEventListener("abort", relayAbort);
  }
}

export const api = {
  get: <T>(path: string, init?: ApiInit) => request<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, payload?: unknown, init?: ApiInit) =>
    request<T>(path, {
      ...init,
      method: "POST",
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
  patch: <T>(path: string, payload?: unknown, init?: ApiInit) =>
    request<T>(path, {
      ...init,
      method: "PATCH",
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
  del: <T>(path: string, init?: ApiInit) => request<T>(path, { ...init, method: "DELETE" }),
};

/** Construit une query string en ignorant les valeurs vides. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
