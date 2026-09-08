import { Download } from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { customFetch } from '@/api/client'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { ObservatoryNav } from '@/design-system/patterns/ObservatoryNav'
import { IncidentDashboardView } from './IncidentDashboardView'
import { IncidentAnalysisPanel } from './IncidentAnalysisPanel'
import { useIncidentAnalysis } from '@/lib/observatory/useIncidentAnalysis'
import { dashboardExportUrl, useIncidentDashboard, type DashboardFilters } from '@/lib/observatory/useIncidentDashboard'
import { PROFILE_LABEL, type IncidentProfile } from '@/lib/observatory/types'

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
        <Button variant="secondary" size="md" loading={exporting} onClick={handleExport}>
          <Download size={16} strokeWidth={1.5} aria-hidden /> Exportar a Excel
        </Button>
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
      </div>

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
          {analysis.data && <IncidentAnalysisPanel analysis={analysis.data} />}
          <IncidentDashboardView
            profile={profile}
            dashboard={data}
            {...(departmentHref ? { departmentHref } : {})}
          />
        </>
      )}
    </div>
  )
}
