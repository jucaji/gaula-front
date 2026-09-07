/**
 * S6.FE.01/02: caminos con el mismo formato indexado que usa el backend
 * para señalar violaciones de campo (`results.seizures[0].quantity`,
 * docs/05 §4) -- se usan tanto para leer/escribir el `payload` anidado
 * como para casar cada campo con su propio error.
 */
export type ReportPayload = Record<string, unknown>

interface PathToken {
  key: string
  index?: number
}

function tokenize(path: string): PathToken[] {
  return path.split('.').map((segment) => {
    const match = /^([^[]+)(?:\[(\d+)\])?$/.exec(segment)
    const key = match?.[1] ?? segment
    const index = match?.[2] === undefined ? undefined : Number(match[2])
    return index === undefined ? { key } : { key, index }
  })
}

export function getAtPath(obj: unknown, path: string): unknown {
  let current: unknown = obj
  for (const token of tokenize(path)) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as ReportPayload)[token.key]
    if (token.index !== undefined) {
      current = Array.isArray(current) ? current[token.index] : undefined
    }
  }
  return current
}

function setAt(obj: unknown, tokens: PathToken[], value: unknown): ReportPayload {
  const base: ReportPayload = obj && typeof obj === 'object' ? { ...(obj as ReportPayload) } : {}
  const [token, ...rest] = tokens
  if (!token) return base
  if (token.index === undefined) {
    base[token.key] = rest.length === 0 ? value : setAt(base[token.key], rest, value)
    return base
  }
  const array: unknown[] = Array.isArray(base[token.key]) ? [...(base[token.key] as unknown[])] : []
  array[token.index] = rest.length === 0 ? value : setAt(array[token.index], rest, value)
  base[token.key] = array
  return base
}

export function setAtPath(obj: ReportPayload, path: string, value: unknown): ReportPayload {
  return setAt(obj, tokenize(path), value)
}
