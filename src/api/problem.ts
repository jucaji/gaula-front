/**
 * docs/07 §8, §5: el backend responde errores como RFC 9457
 * (`application/problem+json`, ver GlobalExceptionHandler/ProblemDetailFactory
 * en el backend). Este es el único punto que conoce esa forma — todo lo
 * demás en el frontend ve un `ApiProblem` ya tipado.
 */
export interface ApiFieldError {
  field: string
  message: string
}

export interface ApiProblem {
  type?: string
  title: string
  status: number
  detail: string
  code?: string
  traceId?: string
  errors?: ApiFieldError[]
}

const FALLBACK_PROBLEM: Omit<ApiProblem, 'status'> = {
  title: 'Error inesperado',
  detail: 'Ocurrió un error inesperado. Si persiste, reporte el identificador de seguimiento.',
}

export async function parseApiProblem(response: Response): Promise<ApiProblem> {
  const traceId = response.headers.get('X-Trace-Id')
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/problem+json') || contentType.includes('application/json')) {
    try {
      const body = (await response.json()) as Partial<ApiProblem>
      const resolvedTraceId = body.traceId ?? traceId
      return {
        ...FALLBACK_PROBLEM,
        ...body,
        status: response.status,
        ...(resolvedTraceId ? { traceId: resolvedTraceId } : {}),
      }
    } catch {
      // el cuerpo no era JSON válido pese al content-type -- cae al fallback
    }
  }

  return { ...FALLBACK_PROBLEM, status: response.status, ...(traceId ? { traceId } : {}) }
}

export class ApiError extends Error {
  readonly problem: ApiProblem

  constructor(problem: ApiProblem) {
    super(problem.detail)
    this.name = 'ApiError'
    this.problem = problem
  }
}
