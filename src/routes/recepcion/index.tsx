import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { customFetch } from '@/api/client'
import type {
  CallResponse,
  CrimeTypeResponse,
  ModusOperandiResponse,
  MunicipalityResponse,
  ReferralGuidelineResponse,
  ReporterHistoryResponse,
} from '@/api/generated/models'
import { ModusOperandiPanel } from '@/design-system/domain/ModusOperandiPanel'
import { ReferralGuide } from '@/design-system/domain/ReferralGuide'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { clearDraft, loadDraft, saveDraft } from '@/lib/storage/callDraftStore'

export const Route = createFileRoute('/recepcion/')({
  beforeLoad: ({ context }) => {
    if (!context.can('CREATE', 'CALL')) {
      throw redirect({ to: '/', search: { denied: 'CALL' } })
    }
  },
  component: RecepcionConsole,
})

/** docs/06 §8.1: sólo dos salidas -- "Derivar" y "Crear caso" son los dos desenlaces del §1.3. */
type ExitFlow = 'none' | 'referral'

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

function formatElapsed(startedAtIso: string, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - new Date(startedAtIso).getTime()) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function useCrimeTypes() {
  return useQuery({
    queryKey: ['catalog', 'crime-types'],
    queryFn: () => customFetch<CrimeTypeResponse[]>('/api/v1/catalog/crime-types'),
    staleTime: Infinity,
    networkMode: 'always',
    retry: false,
  })
}

function useReporterLookup(phone: string) {
  const debouncedPhone = useDebounced(phone, 400)
  return useQuery({
    queryKey: ['reporters', 'lookup', debouncedPhone],
    queryFn: () => customFetch<ReporterHistoryResponse>(`/api/v1/reporters/lookup?phone=${encodeURIComponent(debouncedPhone)}`),
    enabled: debouncedPhone.trim().length >= 7,
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function useMunicipalitySearch(q: string) {
  const debouncedQ = useDebounced(q, 250)
  return useQuery({
    queryKey: ['catalog', 'municipalities', debouncedQ],
    queryFn: () => customFetch<MunicipalityResponse[]>(`/api/v1/catalog/municipalities?q=${encodeURIComponent(debouncedQ)}`),
    enabled: debouncedQ.trim().length >= 2,
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function useModusOperandi(crimeTypeCode: string) {
  return useQuery({
    queryKey: ['catalog', 'modus-operandi', crimeTypeCode],
    queryFn: () => customFetch<ModusOperandiResponse[]>(`/api/v1/catalog/modus-operandi?crimeTypeCode=${encodeURIComponent(crimeTypeCode)}`),
    enabled: crimeTypeCode.length > 0,
    staleTime: 30_000,
    networkMode: 'always',
    retry: false,
  })
}

function useReferralGuidelines(crimeTypeCode: string, enabled: boolean) {
  return useQuery({
    queryKey: ['catalog', 'referral-guidelines', crimeTypeCode],
    queryFn: () => customFetch<ReferralGuidelineResponse[]>(`/api/v1/catalog/referral-guidelines?crimeTypeCode=${encodeURIComponent(crimeTypeCode)}`),
    enabled: enabled && crimeTypeCode.length > 0,
    staleTime: 30_000,
    networkMode: 'always',
    retry: false,
  })
}

function RecepcionConsole() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const openedRef = useRef(false)

  const [call, setCall] = useState<CallResponse | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const [phone, setPhone] = useState('')
  const [reporterId, setReporterId] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [dataConsent, setDataConsent] = useState(false)
  const [reporterRegistered, setReporterRegistered] = useState(false)
  const [reporterError, setReporterError] = useState<string | null>(null)

  const [municipalityQuery, setMunicipalityQuery] = useState('')
  const [municipalityCode, setMunicipalityCode] = useState<string | null>(null)
  const [resolvedTerritorial, setResolvedTerritorial] = useState<string | null | undefined>(undefined)
  const [crimeTypeCode, setCrimeTypeCode] = useState('')
  const [jurisdiction, setJurisdiction] = useState<'UNDETERMINED' | 'GAULA' | 'REFERRED'>('UNDETERMINED')
  const [narrative, setNarrative] = useState('')

  const [exitFlow, setExitFlow] = useState<ExitFlow>('none')
  const [selectedGuideline, setSelectedGuideline] = useState<ReferralGuidelineResponse | null>(null)
  const [guidanceDelivered, setGuidanceDelivered] = useState(false)
  const [operatorNotes, setOperatorNotes] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const crimeTypes = useCrimeTypes()
  const reporterLookup = useReporterLookup(phone)
  const municipalityMatches = useMunicipalitySearch(municipalityQuery)
  const modusOperandi = useModusOperandi(crimeTypeCode)
  const referralGuidelines = useReferralGuidelines(crimeTypeCode, exitFlow === 'referral' && jurisdiction !== 'GAULA')

  const selectedCrimeType = crimeTypes.data?.find((ct) => ct.code === crimeTypeCode)

  // S4.FE.02: el registro arranca solo -- sin botón "iniciar".
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    customFetch<CallResponse>('/api/v1/calls', { method: 'POST', body: JSON.stringify({ channel: 'PHONE_147' }) })
      .then(setCall)
      .catch((err) => setOpenError(err instanceof Error ? err.message : 'No se pudo abrir el registro de llamada.'))
  }, [])

  // S4.FE.06: cronómetro discreto y permanente.
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  // S4.FE.05: recupera un relato guardado en IndexedDB si el servidor no tiene uno todavía
  // (recuperación tras cierre accidental) -- sólo al conocer el id de la llamada, nunca de
  // nuevo cuando `call.narrative` cambia por un PATCH propio (eso reescribiría lo que el
  // operador ya está escribiendo con el borrador viejo).
  useEffect(() => {
    if (!call?.id) return
    const callId = call.id
    loadDraft(callId).then((draft) => {
      if (draft && !call.narrative) setNarrative(draft)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id])

  // S4.FE.05: autoguardado del relato cada 3 s, con debounce, en IndexedDB.
  useEffect(() => {
    if (!call?.id) return
    const callId = call.id
    const timer = setTimeout(() => {
      void saveDraft(callId, narrative)
    }, 3000)
    return () => clearTimeout(timer)
  }, [call?.id, narrative])

  async function enrich(patch: Record<string, unknown>) {
    if (!call?.id) return
    try {
      const updated = await customFetch<CallResponse>(`/api/v1/calls/${call.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      setCall(updated)
    } catch {
      // S4.FE.05 §Alcance: ningún campo es obligatorio -- un PATCH fallido no bloquea seguir escribiendo.
    }
  }

  async function handlePhoneBlur() {
    if (!call?.id || phone.trim().length < 7) return
    if (reporterId) return
    // Registro automático sólo cuando ya hay suficiente información para hacerlo con sentido:
    // anónimo (sin PII más allá del teléfono) o consentimiento explícito.
    if (!anonymous && !dataConsent) return
    setReporterError(null)
    try {
      const reporter = await customFetch<{ id: string }>('/api/v1/reporters', {
        method: 'POST',
        body: JSON.stringify({ anonymous, fullName: anonymous ? null : fullName || null, phone, victim: true, dataConsent }),
      })
      setReporterId(reporter.id)
      setReporterRegistered(true)
      await enrich({ reporterId: reporter.id })
    } catch (err) {
      setReporterError(err instanceof Error ? err.message : 'No se pudo registrar el denunciante.')
    }
  }

  function handleSelectMunicipality(match: MunicipalityResponse) {
    if (!match.code || match.code === municipalityCode) return
    setMunicipalityCode(match.code)
    setMunicipalityQuery(`${match.name ?? ''}, ${match.departmentName ?? ''}`)
    setResolvedTerritorial(match.territorialUnitName ?? null)
    void enrich({ municipalityCode: match.code })
  }

  // S4.QA.01 (criterio A1, ≤3 interacciones): si al escribir sólo queda una
  // coincidencia, se selecciona sola -- el operador no gasta una interacción
  // aparte en hacer clic sobre la única sugerencia posible.
  useEffect(() => {
    if (municipalityCode) return
    const onlyMatch = municipalityMatches.data?.length === 1 ? municipalityMatches.data[0] : undefined
    if (!onlyMatch) return
    // `queueMicrotask` -- el resultado ya es asíncrono (react-query); esto sólo
    // evita el `setState` síncrono dentro del cuerpo del efecto.
    queueMicrotask(() => handleSelectMunicipality(onlyMatch))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipalityMatches.data, municipalityCode])

  function handleSelectCrimeType(code: string) {
    setCrimeTypeCode(code)
    const crimeType = crimeTypes.data?.find((ct) => ct.code === code)
    const nextJurisdiction = crimeType ? (crimeType.gaulaJurisdiction ? 'GAULA' : 'REFERRED') : 'UNDETERMINED'
    setJurisdiction(nextJurisdiction)
    void enrich({ crimeTypeCode: code, jurisdiction: nextJurisdiction })
  }

  async function handleCloseAsCase() {
    if (!call?.id) return
    setClosing(true)
    setCloseError(null)
    try {
      await customFetch(`/api/v1/calls/${call.id}/close-as-case`, { method: 'PATCH' })
      await clearDraft(call.id)
      await queryClient.invalidateQueries({ queryKey: ['calls'] })
      await navigate({ to: '/recepcion/llamadas' })
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'No se pudo crear el caso.')
    } finally {
      setClosing(false)
    }
  }

  async function handleCloseAsReferral() {
    if (!call?.id || !selectedGuideline) return
    setClosing(true)
    setCloseError(null)
    try {
      await customFetch(`/api/v1/calls/${call.id}/close-as-referral`, {
        method: 'PATCH',
        body: JSON.stringify({
          authorityId: selectedGuideline.authorityId,
          guidanceDelivered,
          evidenceInstructed: selectedGuideline.requiredEvidence,
          operatorNotes: operatorNotes || null,
        }),
      })
      await clearDraft(call.id)
      await queryClient.invalidateQueries({ queryKey: ['calls'] })
      await navigate({ to: '/recepcion/llamadas' })
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'No se pudo derivar la llamada.')
    } finally {
      setClosing(false)
    }
  }

  async function handleCloseNoAction() {
    if (!call?.id) return
    setClosing(true)
    setCloseError(null)
    try {
      await customFetch(`/api/v1/calls/${call.id}/close-no-action`, { method: 'PATCH' })
      await clearDraft(call.id)
      await queryClient.invalidateQueries({ queryKey: ['calls'] })
      await navigate({ to: '/recepcion/llamadas' })
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'No se pudo cerrar la llamada.')
    } finally {
      setClosing(false)
    }
  }

  // S4.FE.07: atajos de teclado para las dos salidas.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!call || closing) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        setExitFlow('referral')
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'enter') {
        event.preventDefault()
        void handleCloseAsCase()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, closing])

  if (openError) {
    return <p className="p-6 text-sm text-critical">{openError}</p>
  }
  if (!call?.id) {
    return <p className="p-6 text-sm text-text-secondary">Abriendo registro de llamada…</p>
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-border pb-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-critical">
          <span className="h-2 w-2 animate-pulse rounded-full bg-critical" aria-hidden />
          GRABANDO {formatElapsed(call.startedAt ?? new Date().toISOString(), nowMs)}
        </span>
        <span className="text-sm text-text-secondary">Llamada #{call.sequenceNumber} · Línea 147</span>
        <div className="ml-auto flex items-center gap-2">
          {closeError && <p className="text-sm text-critical">{closeError}</p>}
          <Button variant="secondary" size="sm" onClick={() => setExitFlow('referral')} disabled={closing}>
            Derivar
          </Button>
          <Button variant="primary" size="sm" onClick={handleCloseAsCase} loading={closing}>
            Crear caso
          </Button>
          <button
            type="button"
            onClick={handleCloseNoAction}
            disabled={closing}
            className="text-2xs text-text-muted underline hover:text-text-secondary"
          >
            Sin acción
          </button>
        </div>
      </header>

      {exitFlow === 'referral' && (
        <div className="mt-3 rounded-sm border border-border-strong bg-surface-raised p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Derivar</h2>
            <button type="button" onClick={() => setExitFlow('none')} className="text-2xs text-text-muted hover:text-text-primary">
              Cerrar
            </button>
          </div>
          {jurisdiction === 'GAULA' && (
            <p className="mt-2 text-sm text-critical">Esta tipología es competencia del GAULA -- no se puede derivar (SPEC-0103 CA-1).</p>
          )}
          {jurisdiction !== 'GAULA' && (
            <div className="mt-2 flex flex-col gap-2">
              {referralGuidelines.isLoading && <p className="text-sm text-text-secondary">Cargando guía…</p>}
              {referralGuidelines.data && referralGuidelines.data.length === 0 && (
                <p className="text-sm text-text-secondary">Sin guía de derivación para esta tipología todavía.</p>
              )}
              {referralGuidelines.data?.map((guideline) => (
                <ReferralGuide
                  key={guideline.authorityId}
                  guideline={guideline}
                  selected={selectedGuideline?.authorityId === guideline.authorityId}
                  onSelect={() => setSelectedGuideline(guideline)}
                />
              ))}
              {selectedGuideline && (
                <>
                  <label className="flex items-center gap-2 text-sm text-text-primary">
                    <input type="checkbox" checked={guidanceDelivered} onChange={(e) => setGuidanceDelivered(e.target.checked)} />
                    Orientación entregada al denunciante
                  </label>
                  <Input placeholder="Notas del operador (opcional)" value={operatorNotes} onChange={(e) => setOperatorNotes(e.target.value)} />
                  <div>
                    <Button variant="primary" size="sm" loading={closing} onClick={handleCloseAsReferral}>
                      Confirmar derivación
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid flex-1 grid-cols-3 gap-4 overflow-hidden">
        <section className="flex flex-col gap-3 overflow-y-auto pr-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Denunciante</h2>
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Teléfono
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={handlePhoneBlur} placeholder="Búsqueda automática" />
          </label>

          {reporterLookup.data?.reporterId && (
            <div className="rounded-sm border border-accent bg-accent-subtle p-2 text-sm">
              <p className="font-medium text-text-primary">ⓘ Contacto previo</p>
              <p className="text-text-secondary">{reporterLookup.data.contactCount} contacto(s) registrado(s)</p>
              {reporterLookup.data.previousCalls?.[0] && (
                <p className="text-2xs text-text-muted">
                  Última: {reporterLookup.data.previousCalls[0].startedAt && new Date(reporterLookup.data.previousCalls[0].startedAt).toLocaleDateString('es-CO')} ·{' '}
                  {reporterLookup.data.previousCalls[0].jurisdiction}
                </p>
              )}
            </div>
          )}

          {reporterLookup.data && !reporterLookup.data.reporterId && !reporterRegistered && (
            <>
              <label className="flex flex-col gap-1 text-sm text-text-primary">
                Nombre (opcional)
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={anonymous} onBlur={handlePhoneBlur} />
              </label>
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input type="checkbox" checked={anonymous} onChange={(e) => { setAnonymous(e.target.checked); }} />
                Anónimo
              </label>
              {!anonymous && (
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input type="checkbox" checked={dataConsent} onChange={(e) => setDataConsent(e.target.checked)} />
                  Consiente el tratamiento de sus datos
                </label>
              )}
              {reporterError && <p className="text-sm text-critical">{reporterError}</p>}
            </>
          )}
        </section>

        <section className="flex flex-col gap-3 overflow-y-auto border-x border-border px-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Clasificación</h2>
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Tipología
            <select
              value={crimeTypeCode}
              onChange={(e) => handleSelectCrimeType(e.target.value)}
              className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
            >
              <option value="">Seleccione…</option>
              {crimeTypes.data?.map((ct) => (
                <option key={ct.code} value={ct.code}>
                  {ct.name}
                </option>
              ))}
            </select>
          </label>

          <label className="relative flex flex-col gap-1 text-sm text-text-primary">
            Municipio
            <Input
              value={municipalityQuery}
              onChange={(e) => {
                setMunicipalityQuery(e.target.value)
                setMunicipalityCode(null)
                setResolvedTerritorial(undefined)
              }}
              placeholder="Tolerante a acentos y errores"
            />
            {municipalityMatches.data && municipalityMatches.data.length > 0 && !municipalityCode && (
              <ul className="absolute top-full z-10 mt-1 w-full rounded-sm border border-border-strong bg-surface-raised shadow-sm">
                {municipalityMatches.data.map((match) => (
                  <li key={match.code}>
                    <button
                      type="button"
                      onClick={() => handleSelectMunicipality(match)}
                      className="block w-full px-2 py-1.5 text-left text-sm hover:bg-surface-sunken"
                    >
                      {match.name}, {match.departmentName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>

          {resolvedTerritorial !== undefined && (
            <div className="rounded-sm border border-border-strong bg-surface-sunken p-2 text-sm">
              {resolvedTerritorial ? (
                <>
                  <span className="text-text-muted">→</span> <span className="font-medium text-text-primary">{resolvedTerritorial}</span>
                  <p className="text-2xs text-text-muted">Enrutamiento automático</p>
                </>
              ) : (
                <p className="text-alert">Sin GAULA territorial asignado para este municipio todavía.</p>
              )}
            </div>
          )}

          {crimeTypeCode && (
            <p className="text-sm text-text-primary">
              Competencia:{' '}
              <span
                className={
                  jurisdiction === 'GAULA' ? 'font-medium text-stable' : jurisdiction === 'REFERRED' ? 'font-medium text-alert' : 'text-text-muted'
                }
              >
                ● {jurisdiction}
              </span>
            </p>
          )}

          <label className="flex flex-1 flex-col gap-1 text-sm text-text-primary">
            Relato
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              onBlur={() => void enrich({ narrative })}
              rows={6}
              className="flex-1 rounded-sm border border-border-strong bg-surface px-2.5 py-2 text-sm text-text-primary"
            />
          </label>
        </section>

        <section className="flex flex-col gap-3 overflow-y-auto pl-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Apoyo al operador</h2>
          {!crimeTypeCode && <p className="text-sm text-text-secondary">Seleccione una tipología para ver señales y recomendaciones.</p>}
          {selectedCrimeType && modusOperandi.data && modusOperandi.data.length > 0 && (
            <ModusOperandiPanel items={modusOperandi.data} />
          )}
        </section>
      </div>
    </div>
  )
}
