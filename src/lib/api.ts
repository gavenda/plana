export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    /** What the server added to act on, such as the channel in a voice conflict. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

/**
 * Thin wrapper over fetch for the dashboard API. A 401 means the session expired
 * while the tab was open, so the page is sent back through the login flow.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options

  const response = await fetch(path, {
    method,
    signal,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login'
    throw new ApiError('Session expired.', 401, 'unauthenticated')
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const detail = payload as {
      error?: string
      code?: string
      details?: Record<string, unknown>
    } | null
    throw new ApiError(
      detail?.error ?? response.statusText,
      response.status,
      detail?.code,
      detail?.details,
    )
  }

  return payload as T
}
