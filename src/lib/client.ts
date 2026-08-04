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

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; meta?: ApiMeta }> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Réponse sans corps JSON (204, erreur réseau côté proxy…).
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
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, payload?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: "POST",
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
  patch: <T>(path: string, payload?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: "PATCH",
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
  del: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: "DELETE" }),
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
