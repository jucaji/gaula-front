import { ApiError, parseApiProblem } from './problem'

/**
 * docs/07 §2.2: el mutator fetch que Orval usa para CADA endpoint generado
 * — nadie escribe `fetch` a mano (docs/01 §4). Token Handler / BFF (docs/04
 * §2.2): la sesión vive en una cookie `HttpOnly`; este cliente nunca ve ni
 * maneja un token de acceso, sólo reenvía la cookie de sesión y el CSRF de
 * doble envío que la protege.
 */

const CSRF_COOKIE_NAME = 'XSRF-TOKEN'
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

export async function customFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)

  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME)
    if (csrfToken) headers.set(CSRF_HEADER_NAME, csrfToken)
  }
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'include', // la cookie de sesión SIEMPRE viaja, mismo origen o proxy de dev
  })

  if (!response.ok) {
    throw new ApiError(await parseApiProblem(response))
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.blob()) as T
}
