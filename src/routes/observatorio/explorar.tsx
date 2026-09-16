import { useEffect, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { ExplorerEditor } from '@/design-system/domain/ExplorerEditor'
import { ObservatoryNav } from '@/design-system/patterns/ObservatoryNav'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import { formatDateTime } from '@/lib/format/formatDateTime'
import {
  DEFAULT_PRESENTATION,
  DEFAULT_REQUEST,
  useExploreCatalog,
  useVisualization,
  useVisualizationMutations,
  useVisualizations,
  type ExploreRequest,
  type Presentation,
  type Visualization,
} from '@/lib/observatory/useExplorer'

const searchSchema = z.object({
  vista: z.string().uuid().optional().catch(undefined),
})

export const Route = createFileRoute('/observatorio/explorar')({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'OBSERVATORY_EXPLORER')) {
      throw redirect({ to: '/', search: { denied: 'OBSERVATORY_EXPLORER' } })
    }
  },
  component: ExplorerPage,
})

const STATUS_LABEL: Record<Visualization['status'], string> = { DRAFT: 'Borrador', PUBLISHED: 'Publicada', ARCHIVED: 'Archivada' }

/**
 * SPEC-0810: el explorador del observatorio. La vista abierta viaja en la
 * dirección (`?vista=`): compartir una vista publicada es compartir el enlace.
 */
function ExplorerPage() {
  const { vista } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { can } = Route.useRouteContext()
  const canSave = can('CREATE', 'OBSERVATORY_EXPLORER')
  const catalog = useExploreCatalog()
  const list = useVisualizations()
  const opened = useVisualization(vista)
  const { create, edit, publish, archive } = useVisualizationMutations()

  const [request, setRequest] = useState<ExploreRequest>(DEFAULT_REQUEST)
  const [presentation, setPresentation] = useState<Presentation>(DEFAULT_PRESENTATION)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Al abrir otra vista se carga su definición UNA vez; las ediciones locales no se pisan
  // cuando la consulta vuelve a traer la misma vista.
  const current = vista && opened.data?.id === vista ? opened.data : null
  if (current && loadedId !== current.id) {
    setLoadedId(current.id)
    setRequest(current.query)
    setPresentation({ ...DEFAULT_PRESENTATION, ...current.presentation })
  }
  if (!vista && loadedId !== null) {
    setLoadedId(null)
  }

  useEffect(() => {
    if (message?.tone !== 'ok') return
    const timer = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [message])

  async function run(action: () => Promise<Visualization>, ok: string) {
    setMessage(null)
    try {
      const saved = await action()
      setLoadedId(saved.id)
      if (saved.status === 'ARCHIVED') {
        void navigate({ search: {} })
      } else if (saved.id !== vista) {
        void navigate({ search: { vista: saved.id } })
      }
      setMessage({ tone: 'ok', text: ok })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar.' })
    }
  }

  const mine = current?.mine ?? false
  const actions = canSave && (
    <>
      {(!current || mine) && (
        <Button variant="secondary" size="sm" loading={create.isPending || edit.isPending}
          onClick={() => void run(() => (current
            ? edit.mutateAsync({ id: current.id, version: current.version, query: request, presentation })
            : create.mutateAsync({ query: request, presentation })), current?.status === 'PUBLISHED' ? 'Cambios guardados en la vista publicada.' : 'Borrador guardado.')}>
          {current?.status === 'PUBLISHED' ? 'Guardar cambios' : 'Guardar como borrador'}
        </Button>
      )}
      {current && !mine && (
        <Button variant="secondary" size="sm" loading={create.isPending} onClick={() => void run(() => create.mutateAsync({ query: request, presentation }), 'Copia guardada como borrador propio.')}>
          Guardar una copia
        </Button>
      )}
      {current && mine && current.status === 'DRAFT' && (
        <Button variant="primary" size="sm" loading={publish.isPending} onClick={() => void run(() => publish.mutateAsync({ id: current.id, version: current.version }), 'Vista publicada para su unidad.')}>
          Publicar
        </Button>
      )}
      {current && mine && (
        <Button variant="ghost" size="sm" loading={archive.isPending} onClick={() => void run(() => archive.mutateAsync({ id: current.id, version: current.version }), 'Vista archivada.')}>
          Archivar
        </Button>
      )}
    </>
  )

  return (
    <div className="flex h-full flex-col gap-4">
      <ObservatoryNav showSnapshot={false} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Explorar datos</h1>
          <p className="max-w-3xl text-sm text-text-secondary">
            Arme la gráfica que necesita sobre las cifras oficiales o el registro nacional. Guarde la pregunta, no la
            foto: al abrirla mañana, muestra las cifras de mañana.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setRequest(DEFAULT_REQUEST); setPresentation(DEFAULT_PRESENTATION); void navigate({ search: {} }) }}>
          Nueva vista
        </Button>
      </header>

      {message && (
        <p role={message.tone === 'ok' ? 'status' : 'alert'} className={`text-sm ${message.tone === 'ok' ? 'text-stable' : 'text-critical'}`}>{message.text}</p>
      )}

      {current && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <Badge tone={current.status === 'PUBLISHED' ? 'stable' : 'neutral'}>{STATUS_LABEL[current.status]}</Badge>
          {current.mine ? 'Suya' : 'Publicada por otra persona de su unidad: puede explorarla y guardar una copia.'}
          <span>· actualizada {formatDateTime(current.updatedAt)}</span>
        </p>
      )}
      {vista && opened.isError && <p role="alert" className="text-sm text-critical">Esa vista no existe o no está disponible para usted.</p>}

      {catalog.isLoading && <p className="text-sm text-text-secondary">Cargando el explorador…</p>}
      {Array.isArray(catalog.data) && catalog.data.length > 0 && (
        <ExplorerEditor catalog={catalog.data} request={request} presentation={presentation} onRequestChange={setRequest} onPresentationChange={setPresentation} actions={actions} />
      )}

      <section aria-label="Vistas guardadas" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Vistas guardadas</h2>
        {Array.isArray(list.data) && list.data.length === 0 && <p className="text-sm text-text-secondary">Todavía no hay vistas guardadas.</p>}
        {Array.isArray(list.data) && list.data.length > 0 && (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {list.data.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => void navigate({ search: { vista: item.id } })}
                  aria-current={item.id === vista ? 'true' : undefined}
                  className="flex min-h-[var(--tap-min)] w-full flex-col items-start gap-1 rounded-sm border border-border-strong bg-surface p-3 text-left hover:border-accent aria-[current=true]:border-accent">
                  <span className="text-sm font-medium text-text-primary">{item.presentation.title ?? 'Vista sin título'}</span>
                  <span className="flex items-center gap-2 text-xs text-text-secondary">
                    <Badge tone={item.status === 'PUBLISHED' ? 'stable' : 'neutral'}>{STATUS_LABEL[item.status]}</Badge>
                    {item.mine ? 'Suya' : 'De su unidad'} · {formatDateTime(item.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
