import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { customFetch } from '@/api/client'
import type { CaseFileResponse } from '@/api/generated/models'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'

export const Route = createFileRoute('/casos/nuevo')({
  beforeLoad: ({ context }) => {
    if (!context.can('CREATE', 'CASE_FILE')) {
      throw redirect({ to: '/', search: { denied: 'CASE_FILE' } })
    }
  },
  component: NewCasePage,
})

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const
const CLASSIFICATION_LEVELS = ['PUBLIC', 'RESTRICTED', 'SECRET'] as const

/** docs/03 §1.3 (R3): abrir un caso exige exactamente 3 campos -- todo lo demás se completa después. */
function NewCasePage() {
  const navigate = useNavigate()
  const [crimeTypeCode, setCrimeTypeCode] = useState('')
  const [municipalityCode, setMunicipalityCode] = useState('')
  const [summary, setSummary] = useState('')
  const [priority, setPriority] = useState('')
  const [classificationLevel, setClassificationLevel] = useState('')
  const [involvesMinor, setInvolvesMinor] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // S2.ADI.03: estable durante toda la vida de este formulario -- un
  // reintento (doble clic, timeout de red) reusa la MISMA clave, así el
  // backend devuelve el caso ya abierto en vez de crear un duplicado.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const created = await customFetch<CaseFileResponse>('/api/v1/case-files', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          crimeTypeCode,
          municipalityCode,
          summary,
          ...(priority ? { priority } : {}),
          ...(classificationLevel ? { classificationLevel } : {}),
          involvesMinor,
        }),
      })
      if (created.trackingNumber) {
        await navigate({ to: '/casos/$trackingNumber', params: { trackingNumber: created.trackingNumber } })
      } else {
        await navigate({ to: '/casos' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el caso.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="text-lg font-semibold text-text-primary">Nuevo caso</h1>
      <p className="mt-1 text-sm text-text-secondary">Sólo 3 campos son obligatorios. El resto se completa después.</p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Tipología (código) *
          <Input required value={crimeTypeCode} onChange={(event) => setCrimeTypeCode(event.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Municipio (código DIVIPOLA) *
          <Input required value={municipalityCode} onChange={(event) => setMunicipalityCode(event.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Resumen *
          <textarea
            required
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={4}
            className="rounded-sm border border-border-strong bg-surface px-2.5 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          />
        </label>

        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-1 text-sm text-text-primary">
            Prioridad
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
            >
              <option value="">Sin definir</option>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-1 flex-col gap-1 text-sm text-text-primary">
            Clasificación
            <select
              value={classificationLevel}
              onChange={(event) => setClassificationLevel(event.target.value)}
              className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
            >
              <option value="">Sin definir</option>
              {CLASSIFICATION_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={involvesMinor}
            onChange={(event) => setInvolvesMinor(event.target.checked)}
            className="h-4 w-4 rounded-xs border-border-strong"
          />
          Involucra a un menor de edad
        </label>

        {error && <p className="text-sm text-critical">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" variant="primary" size="md" loading={submitting}>
            Abrir caso
          </Button>
        </div>
      </form>
    </div>
  )
}
