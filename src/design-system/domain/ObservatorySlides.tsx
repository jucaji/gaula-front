import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react'
import { EchartsChart } from '@/design-system/charts/EchartsChart'
import { barOption, donutOption, monthlyOption, yearlyOption } from '@/design-system/charts/observatoryOptions'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import {
  PROFILE_LABEL,
  type DatasetSnapshot,
  type IncidentAnalysis,
  type IncidentDashboard,
  type IncidentProfile,
} from '@/lib/observatory/types'

/** Los ejes y símbolos se agrandan: la lámina se lee a varios metros, no a medio metro. */
const SLIDE_SCALE = 1.6

interface Slide {
  id: string
  title: string
  /** La bajada dice QUÉ se está mirando; en la mesa nadie tiene la URL a la vista. */
  subtitle?: string
  content: ReactNode
}

/**
 * SPEC-0807 CA-5: el modo lámina.
 *
 * <p>Estos tableros se ven proyectados en la mesa de seguimiento. La lámina NO
 * calcula nada aparte: recibe el mismo tablero y el mismo análisis que la
 * pantalla, así que no puede decir algo distinto de aquello desde lo que se
 * preparó. Si el análisis se abstiene, la lámina lo dice igual.
 *
 * <p>Una lámina por pantalla, y ninguna lámina vacía: una gráfica sin datos
 * proyectada se lee como "no hubo hechos", que casi nunca es lo que pasó.
 */
export function ObservatorySlides({
  profile,
  dashboard,
  analysis,
  snapshot,
  onExit,
}: {
  profile: IncidentProfile
  dashboard: IncidentDashboard
  analysis: IncidentAnalysis | undefined
  snapshot: DatasetSnapshot | null | undefined
  onExit: () => void
}) {
  const theme = useResolvedTheme()
  const [index, setIndex] = useState(0)

  const slides = useMemo<Slide[]>(() => {
    const contexto = { theme, scale: SLIDE_SCALE }
    const construidas: Slide[] = [
      {
        id: 'portada',
        title: PROFILE_LABEL[profile],
        subtitle: 'Registro nacional',
        content: (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-[clamp(4rem,18vw,12rem)] font-semibold leading-none text-text-primary">
              {dashboard.total.toLocaleString('es-CO')}
            </p>
            <p className="text-[clamp(1rem,2.5vw,2rem)] text-text-secondary">
              {dashboard.total === 1 ? 'hecho' : 'hechos'} en el corte vigente
            </p>
          </div>
        ),
      },
    ]

    if (dashboard.monthly.length > 0) {
      construidas.push({
        id: 'evolutivo',
        title: 'Evolutivo mensual',
        content: <EchartsChart option={monthlyOption(dashboard.monthly, contexto)} ariaLabel="Evolutivo mensual" height="100%" />,
      })
    }
    if (dashboard.yearly.length > 1) {
      construidas.push({
        id: 'anual',
        title: 'Comparativo anual',
        content: <EchartsChart option={yearlyOption(dashboard.yearly, contexto)} ariaLabel="Comparativo anual" height="100%" />,
      })
    }

    // Las variaciones van en TEXTO grande, no en gráfica: lo que hay que leer a
    // varios metros es si el cambio es distinguible del ruido, no la forma de
    // una barra (SPEC-0805 CA-5).
    const variaciones = analysis?.variations ?? []
    if (variaciones.length > 0) {
      construidas.push({
        id: 'variaciones',
        title: 'Variaciones',
        subtitle: 'Un porcentaje sin incertidumbre no se publica',
        content: (
          <div className="flex h-full flex-col justify-center gap-6">
            {variaciones.map((variation) => (
              <div key={variation.label} className="border-l-4 border-border-strong pl-4">
                <p className="text-[clamp(0.9rem,1.6vw,1.4rem)] text-text-secondary">{variation.label}</p>
                <p className="flex flex-wrap items-baseline gap-3">
                  <span className="text-[clamp(2rem,7vw,5rem)] font-semibold leading-none text-text-primary">
                    {variation.changePct == null ? '—' : `${variation.changePct > 0 ? '+' : ''}${variation.changePct.toFixed(1)} %`}
                  </span>
                  <span
                    className={`text-[clamp(0.8rem,1.6vw,1.3rem)] font-semibold uppercase tracking-wide ${
                      variation.significant ? 'text-critical' : 'text-text-muted'
                    }`}
                  >
                    {variation.significant ? 'significativa' : 'dentro del ruido'}
                  </span>
                </p>
                <p className="text-[clamp(0.8rem,1.4vw,1.1rem)] text-text-secondary">
                  {variation.current} contra {variation.previous}
                </p>
              </div>
            ))}
          </div>
        ),
      })
    }

    const anomalias = analysis?.anomalies ?? []
    if (anomalias.length > 0) {
      construidas.push({
        id: 'anomalias',
        title: 'Anomalías por municipio',
        subtitle: 'Cada municipio contra su propia historia, no contra el promedio nacional',
        content: (
          <div className="flex h-full flex-col justify-center gap-5">
            {anomalias.slice(0, 5).map((anomaly) => (
              <div key={`${anomaly.municipalityText}-${anomaly.month}`}>
                <p className="text-[clamp(1.4rem,4vw,3rem)] font-semibold leading-tight text-text-primary">
                  {anomaly.municipalityText}
                </p>
                <p className="text-[clamp(0.85rem,1.6vw,1.3rem)] text-text-secondary">{anomaly.explanation}</p>
              </div>
            ))}
          </div>
        ),
      })
    }

    const focos = analysis?.hotspots ?? []
    if (focos.length > 0) {
      construidas.push({
        id: 'focos',
        title: 'Focos geográficos',
        subtitle: 'Municipios vecinos con hechos, no municipios con muchos hechos',
        content: (
          <div className="flex h-full flex-col justify-center gap-6">
            {focos.map((hotspot) => (
              <div key={hotspot.clusterId}>
                <p className="text-[clamp(1.2rem,3.4vw,2.6rem)] font-semibold leading-tight text-text-primary">
                  {hotspot.municipalities.join(' · ')}
                </p>
                <p className="text-[clamp(0.85rem,1.6vw,1.3rem)] text-text-secondary">
                  {hotspot.totalCount.toLocaleString('es-CO')} hechos en el grupo
                </p>
              </div>
            ))}
          </div>
        ),
      })
    }

    const rankings: { id: string; title: string; rows: typeof dashboard.byAuthorGroup; dimension: string; donut?: boolean }[] = [
      { id: 'autores', title: 'Grupos autores', rows: dashboard.byAuthorGroup, dimension: 'authorGroup' },
      { id: 'departamentos', title: 'Departamentos con más hechos', rows: dashboard.byDepartment, dimension: 'department' },
      { id: 'municipios', title: 'Municipios con más hechos', rows: dashboard.byMunicipality, dimension: 'municipality' },
      { id: 'ocupacion', title: 'Ocupación de la víctima', rows: dashboard.byOccupation ?? [], dimension: 'occupation' },
      profile === 'EXTORTION'
        ? { id: 'modalidad', title: 'Modalidad de la denuncia', rows: dashboard.byModality, dimension: 'modality', donut: true }
        : { id: 'situacion', title: 'Situación de la víctima', rows: dashboard.byVictimStatus, dimension: 'victimStatus', donut: true },
    ]
    for (const ranking of rankings) {
      // Ninguna lámina vacía: proyectar una gráfica sin datos dice "no hubo".
      if (ranking.rows.length === 0) continue
      construidas.push({
        id: ranking.id,
        title: ranking.title,
        content: (
          <EchartsChart
            option={
              ranking.donut
                ? donutOption(ranking.rows, ranking.dimension, contexto)
                : barOption(ranking.rows, ranking.dimension, contexto)
            }
            ariaLabel={ranking.title}
            height="100%"
          />
        ),
      })
    }

    // El cierre es la abstención: lo que no se pudo calcular se proyecta igual
    // que lo que sí (SPEC-0805 CA-6). Es la lámina que evita que alguien lea de
    // más en lo que acaba de ver.
    const notas = analysis?.notes ?? []
    if (notas.length > 0) {
      construidas.push({
        id: 'notas',
        title: 'Lo que no se pudo calcular',
        content: (
          <ul className="flex h-full list-disc flex-col justify-center gap-4 pl-6 text-[clamp(0.9rem,2vw,1.6rem)] text-text-secondary">
            {notas.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ),
      })
    }

    return construidas
  }, [profile, dashboard, analysis, theme])

  const total = slides.length
  const go = useCallback(
    (delta: number) => setIndex((current) => Math.min(Math.max(current + delta, 0), total - 1)),
    [total],
  )

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        go(1)
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        go(-1)
      } else if (event.key === 'Escape') {
        onExit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onExit])

  const slide = slides[Math.min(index, total - 1)]
  if (!slide) return null

  return (
    <section
      aria-label="Modo lámina"
      className="fixed inset-0 z-50 flex flex-col bg-surface p-[clamp(1rem,3vw,3rem)]"
    >
      {/* La procedencia va en TODAS las láminas: una cifra proyectada sin corte
          es la lámina «VERSIÓN 27» escrita a mano que este módulo vino a
          reemplazar (SPEC-0803 CA-1). */}
      <header className="flex flex-wrap items-baseline justify-between gap-2 text-[clamp(0.7rem,1.2vw,1rem)] text-text-secondary">
        <span>
          {snapshot
            ? `Corte al ${new Date(`${snapshot.cutoffDate}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })} · ${snapshot.source}${snapshot.label ? ` · ${snapshot.label}` : ''}`
            : 'Sin corte vigente'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
            className="flex min-h-[var(--tap-min)] items-center gap-1 rounded-sm px-2 text-text-secondary hover:text-text-primary"
          >
            <Maximize2 size={16} strokeWidth={1.5} aria-hidden /> Pantalla completa
          </button>
          <button
            type="button"
            onClick={onExit}
            className="flex min-h-[var(--tap-min)] items-center gap-1 rounded-sm px-2 text-text-secondary hover:text-text-primary"
          >
            <X size={16} strokeWidth={1.5} aria-hidden /> Salir
          </button>
        </div>
      </header>

      <div className="mt-[clamp(0.5rem,2vh,2rem)] flex min-h-0 flex-1 flex-col">
        <h2 className="text-[clamp(1.3rem,3.4vw,3rem)] font-semibold leading-tight text-text-primary">{slide.title}</h2>
        {slide.subtitle && (
          <p className="text-[clamp(0.8rem,1.4vw,1.2rem)] text-text-secondary">{slide.subtitle}</p>
        )}
        <div className="mt-[clamp(0.5rem,2vh,1.5rem)] min-h-0 flex-1">{slide.content}</div>
      </div>

      <footer className="flex items-center justify-between gap-3 pt-[clamp(0.5rem,1.5vh,1rem)]">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Lámina anterior"
          className="flex size-[var(--tap-min)] items-center justify-center rounded-sm border border-border-strong text-text-secondary disabled:opacity-40"
        >
          <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
        </button>
        {/* Se anuncia el cambio de lámina: quien navega con teclado y lector de
            pantalla no ve el número de abajo. */}
        <p aria-live="polite" className="text-[clamp(0.7rem,1.2vw,1rem)] text-text-secondary">
          {slide.title} · lámina {index + 1} de {total}
        </p>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index >= total - 1}
          aria-label="Lámina siguiente"
          className="flex size-[var(--tap-min)] items-center justify-center rounded-sm border border-border-strong text-text-secondary disabled:opacity-40"
        >
          <ChevronRight size={20} strokeWidth={1.5} aria-hidden />
        </button>
      </footer>
    </section>
  )
}
