import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { customFetch } from '@/api/client'
import type { HotlineLoadReportResponse } from '@/api/generated/models'
import { KpiTile } from '@/design-system/domain/KpiTile'
import { ChartWithTable } from '@/design-system/patterns/ChartWithTable'
import { EchartsChart } from '@/design-system/charts/EchartsChart'
import { getCategoricalPalette } from '@/design-system/charts/palette'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import { Input } from '@/design-system/primitives/Input'
import type { EChartsOption } from 'echarts'

function isoDateTime(date: Date): string {
  return date.toISOString()
}

function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 29)
  return { from: isoDateTime(from), to: isoDateTime(to) }
}

const hotlineLoadSearchSchema = z.object({
  from: z.string().catch(() => defaultRange().from),
  to: z.string().catch(() => defaultRange().to),
})

export const Route = createFileRoute('/analitica/carga-147')({
  validateSearch: hotlineLoadSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'ANALYTICS')) {
      throw redirect({ to: '/', search: { denied: 'ANALYTICS' } })
    }
  },
  component: HotlineLoadPage,
})

function useHotlineLoad(from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', 'hotline-load', from, to],
    queryFn: () => customFetch<HotlineLoadReportResponse>(`/api/v1/analytics/hotline-load?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    staleTime: 15_000,
    networkMode: 'always',
    retry: false,
  })
}

/** SPEC-0107: "un dato que hoy nadie tiene" -- cuánta capacidad de la 147 consumen casos de otra autoridad. */
function HotlineLoadPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const theme = useResolvedTheme()
  const palette = getCategoricalPalette(theme)
  const hotlineLoad = useHotlineLoad(search.from, search.to)
  const data = hotlineLoad.data

  const breakdownRows = [
    { label: 'Caso creado', value: data?.casesOpened ?? 0 },
    { label: 'Derivada', value: data?.referredCalls ?? 0 },
    { label: 'Sin acción', value: data?.noActionCalls ?? 0 },
  ]

  const breakdownOption: EChartsOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: breakdownRows.map((row, index) => ({ name: row.label, value: row.value, itemStyle: { color: palette[index] ?? '#00997f' } })),
        label: { formatter: '{b}: {c}' },
      },
    ],
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text-primary">Carga de la línea 147</h1>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Desde
          <Input
            size="sm"
            type="date"
            value={search.from.slice(0, 10)}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, from: new Date(event.target.value).toISOString() }) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Hasta
          <Input
            size="sm"
            type="date"
            value={search.to.slice(0, 10)}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, to: new Date(event.target.value).toISOString() }) })}
          />
        </label>
      </div>

      {hotlineLoad.isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
      {hotlineLoad.isError && <p className="text-sm text-critical">No se pudo cargar el indicador.</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Llamadas cerradas" value={data.totalClosedCalls ?? 0} />
            <KpiTile label="Casos creados" value={data.casesOpened ?? 0} />
            <KpiTile label="Derivadas" value={data.referredCalls ?? 0} />
            <KpiTile
              label="% derivadas"
              value={data.referredCallPercentage ?? 0}
              format={(n) => `${n.toFixed(1)}%`}
            />
          </div>

          <ChartWithTable
            title="Desenlace de las llamadas cerradas"
            chart={<EchartsChart option={breakdownOption} ariaLabel="Distribución de desenlaces de llamadas" height={280} />}
            rows={breakdownRows}
            columns={[
              { header: 'Desenlace', cell: (row) => row.label },
              { header: 'Llamadas', cell: (row) => row.value.toLocaleString('es-CO') },
            ]}
            getRowKey={(row) => row.label}
          />

          <p className="text-2xs text-text-muted">
            % de duración derivada: {(data.referredDurationPercentage ?? 0).toFixed(1)}% ({data.referredDurationSeconds ?? 0} s de{' '}
            {data.totalDurationSeconds ?? 0} s totales)
          </p>
        </>
      )}
    </div>
  )
}
