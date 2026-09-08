import { Download, Presentation } from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { customFetch } from '@/api/client'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { ObservatoryNav } from '@/design-system/patterns/ObservatoryNav'
import { IncidentMap } from '@/design-system/charts/IncidentMap'
import { ObservatorySlides } from './ObservatorySlides'
import { useActiveSnapshot } from '@/lib/observatory/useActiveSnapshot'
import { FilterChips, type AppliedFilter } from '@/design-system/patterns/FilterChips'
import { IncidentDashboardView } from './IncidentDashboardView'
import { IncidentAnalysisPanel } from './IncidentAnalysisPanel'
import { useIncidentAnalysis } from '@/lib/observatory/useIncidentAnalysis'
import { dashboardExportUrl, useIncidentDashboard, type DashboardFilters } from '@/lib/observatory/useIncidentDashboard'
import {
  KIDNAPPING_TYPE_LABEL,
  MODALITY_LABEL,
  PROFILE_LABEL,
  VICTIM_STATUS_LABEL,
  type IncidentProfile,
} from '@/lib/observatory/types'

/**
 * SPEC-0803: la pantalla de tablero, compartida por los dos delitos.
 *
 * <p>Los filtros NO viven aquí: llegan de la URL y se devuelven por
 * `onFiltersChange`, que los escribe de vuelta en la URL (CA-3). Es lo que hace
 * que compartir una vista sea compartir un enlace y no una captura de pantalla
 * — la práctica que hoy circula por WhatsApp.
 */
export function ObservatoryDashboardScreen({
  profile,
  filters,
  onFiltersChange,
  department,
  departmentHref,
}: {
  profile: IncidentProfile
  filters: DashboardFilters
  onFiltersChange: (filters: DashboardFilters) => void
  /** Presente en el drill-down: la página está mirando UN departamento. */
  department?: string
  departmentHref?: (department: string) => { to: string; params: Record<string, string> }
}) {
  const { data, isLoading, isError, error } = useIncidentDashboard(profile, filters)
  // Consulta APARTE: el tablero no espera al análisis para pintarse (SPEC-0805 CA-2).
  const analysis = useIncidentAnalysis(profile, filters)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  // SPEC-0807 CA-5: la lámina es una VISTA de este mismo tablero, no otra
  // consulta. Si fuera otra pantalla con su propia carga, lo proyectado podría
  // diferir de lo que el analista revisó antes de entrar a la sala.
  const [slideMode, setSlideMode] = useState(false)
  const snapshot = useActiveSnapshot()

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const blob = await customFetch<Blob>(dashboardExportUrl(profile, filters))
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `observatorio-${profile.toLowerCase()}.xlsx`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar el tablero.')
    } finally {
      setExporting(false)
    }
  }

  if (slideMode && data?.snapshotId) {
    return (
      <ObservatorySlides
        profile={profile}
        dashboard={data}
        analysis={analysis.data}
        snapshot={snapshot.data}
        onExit={() => setSlideMode(false)}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ObservatoryNav />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            {profile === 'EXTORTION' ? 'Denuncias por extorsión' : 'Víctimas de secuestro'}
          </h1>
          {department && (
            <p className="text-2xs text-text-secondary">
              Departamento: <span className="font-medium text-text-primary">{department}</span> ·{' '}
              <Link
                to={profile === 'EXTORTION' ? '/tableros/extorsion' : '/tableros/secuestro'}
                search={filters}
                className="text-accent hover:underline"
              >
                ver todos
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.snapshotId && (
            <Button variant="secondary" size="md" onClick={() => setSlideMode(true)}>
              <Presentation size={16} strokeWidth={1.5} aria-hidden /> Modo lámina
            </Button>
          )}
          <Button variant="secondary" size="md" loading={exporting} onClick={handleExport}>
            <Download size={16} strokeWidth={1.5} aria-hidden /> Exportar a Excel
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Desde
          <Input
            type="date"
            value={filters.from ?? ''}
            onChange={(event) => onFiltersChange({ ...filters, from: event.target.value || undefined })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Hasta
          <Input
            type="date"
            value={filters.to ?? ''}
            onChange={(event) => onFiltersChange({ ...filters, to: event.target.value || undefined })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Autor
          <Input
            value={filters.authorGroup ?? ''}
            placeholder="GDCO, ELN…"
            onChange={(event) => onFiltersChange({ ...filters, authorGroup: event.target.value || undefined })}
          />
        </label>

        {/*
          Las listas se llenan con lo que ESTE corte tiene, no con un catálogo
          fijo: ofrecer una opción que no existe en el dato lleva al analista a
          una pantalla vacía y le hace creer que no hubo hechos.
        */}
        {profile === 'EXTORTION' && (
          <FiltroLista
            etiqueta="Modalidad"
            valor={filters.modality}
            opciones={(data?.byModality ?? []).map((item) => ({
              value: item.key,
              label: MODALITY_LABEL[item.key as keyof typeof MODALITY_LABEL] ?? item.key,
            }))}
            onChange={(value) => onFiltersChange({ ...filters, modality: value })}
          />
        )}
        {profile === 'KIDNAPPING' && (
          <>
            <FiltroLista
              etiqueta="Tipo de secuestro"
              valor={filters.kidnappingType}
              opciones={(data?.byKidnappingType ?? []).map((item) => ({
                value: item.key,
                label: KIDNAPPING_TYPE_LABEL[item.key as keyof typeof KIDNAPPING_TYPE_LABEL] ?? item.key,
              }))}
              onChange={(value) => onFiltersChange({ ...filters, kidnappingType: value })}
            />
            <FiltroLista
              etiqueta="Situación de la víctima"
              valor={filters.victimStatus}
              opciones={(data?.byVictimStatus ?? []).map((item) => ({
                value: item.key,
                label: VICTIM_STATUS_LABEL[item.key as keyof typeof VICTIM_STATUS_LABEL] ?? item.key,
              }))}
              onChange={(value) => onFiltersChange({ ...filters, victimStatus: value })}
            />
          </>
        )}
        <FiltroLista
          etiqueta="Ocupación"
          valor={filters.occupation}
          opciones={(data?.byOccupation ?? []).map((item) => ({ value: item.key, label: item.key }))}
          onChange={(value) => onFiltersChange({ ...filters, occupation: value })}
        />
      </div>

      <FilterChips
        filters={appliedFilters(filters, Array.isArray(data?.map) ? data.map : [])}
        onRemove={(key) => onFiltersChange({ ...filters, [key]: undefined })}
        onClearAll={() => onFiltersChange({})}
      />

      {exportError && (
        <p className="mt-2 text-sm text-critical" role="alert">
          {exportError}
        </p>
      )}

      {isError && (
        <p className="mt-4 text-sm text-critical" role="alert">
          {error instanceof Error ? error.message : 'No se pudo consultar el tablero.'}
        </p>
      )}

      {isLoading && <p className="mt-6 text-sm text-text-secondary">Consultando el corte vigente…</p>}

      {/* SPEC-0803 CA-5: sin corte no se pintan ceros. Un cero afirma "cero hechos". */}
      {data && !data.snapshotId && (
        <div className="mt-6 rounded-sm border border-border-strong bg-surface-raised p-4">
          <p className="text-sm font-semibold text-text-primary">No hay ningún corte cargado</p>
          <p className="mt-1 max-w-xl text-sm text-text-secondary">
            Sin corte vigente no hay cifras que mostrar. No es que no haya hechos: es que todavía nadie ha cargado el
            registro nacional.
          </p>
          <Button className="mt-3" asChild variant="primary" size="sm">
            <Link to="/observatorio/cargue">Ir a Cargue</Link>
          </Button>
        </div>
      )}

      {data?.snapshotId && (
        <>
          <p className="mt-3 text-2xs text-text-muted">
            {data.total.toLocaleString('es-CO')} {data.total === 1 ? 'hecho' : 'hechos'} de{' '}
            {PROFILE_LABEL[profile].toLowerCase()} en el corte vigente con estos filtros.
          </p>
          {/*
            El mapa NO espera al análisis (CA-6): los focos y las anomalías son una
            capa encima de los conteos, no el mapa. Con el servicio caído, el mapa
            sigue mostrando dónde están los hechos.
          */}
          {/*
            Sin `map` en la respuesta (un backend anterior a SPEC-0807, o una
            respuesta recortada) no se dibuja un mapa vacío: un mapa sin puntos
            se lee como "no hubo hechos aquí", que es justo lo que no pasó.
          */}
          {Array.isArray(data.map) && (
          <IncidentMap
            points={data.map}
            total={data.total}
            mappedTotal={data.mappedTotal ?? 0}
            hotspotMunicipalities={(analysis.data?.hotspots ?? []).flatMap((hotspot) => hotspot.municipalities)}
            anomalyMunicipalities={(analysis.data?.anomalies ?? []).map((anomaly) => anomaly.municipalityText)}
            selectedMunicipalityCode={filters.municipalityCode}
            onSelect={(municipalityCode) => onFiltersChange({ ...filters, municipalityCode })}
          />
          )}
          {analysis.data && <IncidentAnalysisPanel analysis={analysis.data} />}
          <IncidentDashboardView
            profile={profile}
            dashboard={data}
            from={filters.from}
            to={filters.to}
            {...(departmentHref ? { departmentHref } : {})}
          />
        </>
      )}
    </div>
  )
}

/** Una lista de filtro. Vacía = «todos», nunca una opción inventada. */
function FiltroLista({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string
  valor: string | undefined
  opciones: { value: string; label: string }[]
  onChange: (value: string | undefined) => void
}) {
  if (opciones.length === 0) return null
  return (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      {etiqueta}
      {/*
        El nombre accesible dice que esto FILTRA: la gráfica de más abajo se
        llama igual ("Situación de la víctima"), y sin el prefijo un lector de
        pantalla anuncia dos controles con el mismo nombre y distinta función.
      */}
      <select
        aria-label={`Filtrar por ${etiqueta.toLowerCase()}`}
        value={valor ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
      >
        <option value="">Todas</option>
        {opciones.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.label}
          </option>
        ))}
      </select>
    </label>
  )
}

const FILTER_LABELS: Record<string, string> = {
  from: 'Desde',
  to: 'Hasta',
  departmentText: 'Departamento',
  municipalityCode: 'Municipio',
  authorGroup: 'Autor',
  modality: 'Modalidad',
  kidnappingType: 'Tipo',
  victimStatus: 'Situación',
  occupation: 'Ocupación',
}

/**
 * Los filtros puestos, con su valor legible. El municipio se muestra por su
 * NOMBRE aunque en la URL viaje el código DIVIPOLA: una ficha que dijera
 * «Municipio: 05360» obliga al analista a traducir un código de memoria.
 */
function appliedFilters(filters: DashboardFilters, points: { municipalityCode: string; municipalityText: string }[]) {
  const municipio = points.find((point) => point.municipalityCode === filters.municipalityCode)
  return Object.entries(filters)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
    .map<AppliedFilter>(([key, value]) => ({
      key,
      label: FILTER_LABELS[key] ?? key,
      value: key === 'municipalityCode' ? (municipio?.municipalityText ?? value) : value,
    }))
}
