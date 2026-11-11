/**
 * Typed fetch for /api/coach and /api/client.
 *
 * Retries once on a server error or a dropped connection (ADR-MASTER section 1), but only for a GET or a
 * write marked {@code idempotent}: one that carries an idempotency key in its body, so the retry is recognised
 * as the same request and nothing is done twice (ADR-006 d4b). Booking is the only one so far.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  /** The body carries an idempotency key, so a retry after a server error is safe. */
  idempotent?: boolean;
}

const FALLBACK = 'Something went wrong. Try again.';

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers({ Accept: 'application/json' });
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const init: RequestInit = {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  };

  const attempts = method === 'GET' || options.idempotent ? 2 : 1;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    let res: Response;
    try {
      res = await fetch(path, init);
    } catch {
      last = new ApiError(0, 'NETWORK', 'Can’t reach BladeBook. Check your connection and try again.');
      continue;
    }
    if (res.ok) {
      return (res.status === 204 ? undefined : await res.json()) as T;
    }
    last = await toError(res);
    if (res.status < 500) break;
  }
  throw last;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string; message?: string; field?: string };
    return new ApiError(res.status, body.error ?? 'UNKNOWN', body.message ?? FALLBACK, body.field);
  } catch {
    return new ApiError(res.status, 'UNKNOWN', FALLBACK);
  }
}
