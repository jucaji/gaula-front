import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { Link } from '@tanstack/react-router'
import { ChartWithTable } from '@/design-system/patterns/ChartWithTable'
import { EchartsChart } from '@/design-system/charts/EchartsChart'
import { CATEGORICAL_LIGHT, getCategoricalPalette, getSequentialPalette } from '@/design-system/charts/palette'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import {
  KIDNAPPING_TYPE_LABEL,
  MODALITY_LABEL,
  VICTIM_STATUS_LABEL,
  type Breakdown,
  type IncidentDashboard,
  type IncidentProfile,
} from '@/lib/observatory/types'

const MONTH_LABEL = new Intl.DateTimeFormat('es-CO', { month: 'short', year: '2-digit' })

function labelFor(dimension: string, key: string): string {
  if (dimension === 'modality') return MODALITY_LABEL[key as keyof typeof MODALITY_LABEL] ?? key
  if (dimension === 'victimStatus') return VICTIM_STATUS_LABEL[key as keyof typeof VICTIM_STATUS_LABEL] ?? key
  if (dimension === 'kidnappingType') return KIDNAPPING_TYPE_LABEL[key as keyof typeof KIDNAPPING_TYPE_LABEL] ?? key
  return key
}

function shareOf(rows: Breakdown[], row: Breakdown): string {
  const total = rows.reduce((sum, item) => sum + item.count, 0)
  return total === 0 ? '—' : `${((row.count / total) * 100).toFixed(1)} %`
}

/**
 * SPEC-0803: la página de tablero, compartida por extorsión y secuestro.
 *
 * <p>Cada gráfica va dentro de `ChartWithTable` porque docs/06 §3.5 lo exige y
 * porque la tabla es la única forma de CITAR una cifra: el tablero actual sólo
 * muestra porcentajes en una dona, y de ahí nadie puede sacar el conteo exacto.
 */
export function IncidentDashboardView({
  profile,
  dashboard,
  departmentHref,
}: {
  profile: IncidentProfile
  dashboard: IncidentDashboard
  /** Drill-down: SPEC-0803 CA-4 exige que sea una ruta, no un estado interno. */
  departmentHref?: (department: string) => { to: string; params: Record<string, string> }
}) {
  const theme = useResolvedTheme()
  const categorical = getCategoricalPalette(theme)
  const sequential = getSequentialPalette(theme)
  // La paleta está tipada como `readonly string[]`, así que TypeScript no sabe
  // que los slots existen. El respaldo es el slot 0 de la MISMA paleta -- nunca
  // un hex inventado, que sería un color fuera de la escala validada (docs/06 §3.5).
  const slot = (index: number) => categorical[index] ?? CATEGORICAL_LIGHT[0]

  const monthlyOption = useMemo<EChartsOption>(
    () => ({
      color: [slot(0)],
      grid: { left: 48, right: 16, top: 24, bottom: 32 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: dashboard.monthly.map((point) => MONTH_LABEL.format(new Date(`${point.month}T00:00:00`))),
      },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{ type: 'line', smooth: false, symbolSize: 8, lineStyle: { width: 2 }, data: dashboard.monthly.map((p) => p.count) }],
    }),
    [dashboard.monthly, categorical],
  )

  const yearlyOption = useMemo<EChartsOption>(
    () => ({
      color: [slot(1)],
      grid: { left: 48, right: 16, top: 24, bottom: 32 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: dashboard.yearly.map((point) => String(point.year)) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{ type: 'bar', barMaxWidth: 28, itemStyle: { borderRadius: [4, 4, 0, 0] }, data: dashboard.yearly.map((p) => p.count) }],
    }),
    [dashboard.yearly, categorical],
  )

  function barOption(rows: Breakdown[], dimension: string): EChartsOption {
    return {
      color: [slot(2)],
      grid: { left: 140, right: 24, top: 16, bottom: 32 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: {
        type: 'category',
        data: [...rows].reverse().map((row) => labelFor(dimension, row.key)),
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          itemStyle: { borderRadius: [0, 4, 4, 0] },
          data: [...rows].reverse().map((row) => row.count),
        },
      ],
    }
  }

  function donutOption(rows: Breakdown[], dimension: string): EChartsOption {
    return {
      color: [...sequential],
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          itemStyle: { borderWidth: 2, borderColor: 'transparent' },
          label: { show: false },
          data: rows.map((row) => ({ name: labelFor(dimension, row.key), value: row.count })),
        },
      ],
    }
  }

  if (dashboard.total === 0) {
    return (
      <EmptyState
        title="El corte vigente no tiene hechos con estos filtros"
        description="Cambie el rango de fechas o quite algún filtro. Si acaba de cargar un corte, revise la pestaña Cargue."
      />
    )
  }

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <ChartWithTable
        title="Evolutivo mensual"
        chart={<EchartsChart option={monthlyOption} ariaLabel="Hechos por mes" />}
        rows={dashboard.monthly}
        columns={[
          { header: 'Mes', cell: (row) => row.month },
          { header: 'Hechos', cell: (row) => row.count.toLocaleString('es-CO') },
        ]}
        getRowKey={(row) => row.month}
      />

      <ChartWithTable
        title="Comparativo anual"
        chart={<EchartsChart option={yearlyOption} ariaLabel="Hechos por año" />}
        rows={dashboard.yearly}
        columns={[
          { header: 'Año', cell: (row) => row.year },
          { header: 'Hechos', cell: (row) => row.count.toLocaleString('es-CO') },
        ]}
        getRowKey={(row) => String(row.year)}
      />

      <ChartWithTable
        title="Grupo autor"
        chart={<EchartsChart option={barOption(dashboard.byAuthorGroup, 'authorGroup')} ariaLabel="Hechos por grupo autor" />}
        rows={dashboard.byAuthorGroup}
        columns={[
          { header: 'Autor', cell: (row) => row.key },
          { header: 'Hechos', cell: (row) => row.count.toLocaleString('es-CO') },
          { header: 'Participación', cell: (row) => shareOf(dashboard.byAuthorGroup, row) },
        ]}
        getRowKey={(row) => row.key}
      />

      <ChartWithTable
        title="Departamentos con más hechos"
        chart={<EchartsChart option={barOption(dashboard.byDepartment, 'department')} ariaLabel="Hechos por departamento" />}
        rows={dashboard.byDepartment}
        columns={[
          {
            header: 'Departamento',
            // SPEC-0803 CA-4: el drill-down es un enlace real. Se comparte una URL,
            // no una captura de pantalla.
            cell: (row) =>
              departmentHref ? (
                <Link {...departmentHref(row.key)} className="text-accent hover:underline">
                  {row.key}
                </Link>
              ) : (
                row.key
              ),
          },
          { header: 'Hechos', cell: (row) => row.count.toLocaleString('es-CO') },
          { header: 'Participación', cell: (row) => shareOf(dashboard.byDepartment, row) },
        ]}
        getRowKey={(row) => row.key}
      />

      <ChartWithTable
        title="Municipios con más hechos"
        chart={<EchartsChart option={barOption(dashboard.byMunicipality, 'municipality')} ariaLabel="Hechos por municipio" />}
        rows={dashboard.byMunicipality}
        columns={[
          { header: 'Municipio', cell: (row) => row.key },
          { header: 'Hechos', cell: (row) => row.count.toLocaleString('es-CO') },
        ]}
        getRowKey={(row) => row.key}
      />

      {profile === 'EXTORTION' && (
        <ChartWithTable
          title="Modalidad de la denuncia"
          chart={<EchartsChart option={donutOption(dashboard.byModality, 'modality')} ariaLabel="Hechos por modalidad" />}
          rows={dashboard.byModality}
          columns={[
            { header: 'Modalidad', cell: (row) => labelFor('modality', row.key) },
            { header: 'Hechos', cell: (row) => row.count.toLocaleString('es-CO') },
            { header: 'Participación', cell: (row) => shareOf(dashboard.byModality, row) },
          ]}
          getRowKey={(row) => row.key}
        />
      )}

      {profile === 'KIDNAPPING' && (
        <>
          <ChartWithTable
            title="Situación de la víctima"
            chart={<EchartsChart option={donutOption(dashboard.byVictimStatus, 'victimStatus')} ariaLabel="Hechos por situación de la víctima" />}
            rows={dashboard.byVictimStatus}
            columns={[
              { header: 'Situación', cell: (row) => labelFor('victimStatus', row.key) },
              { header: 'Hechos', cell: (row) => row.count.toLocaleString('es-CO') },
              { header: 'Participación', cell: (row) => shareOf(dashboard.byVictimStatus, row) },
            ]}
            getRowKey={(row) => row.key}
          />
          <ChartWithTable
            title="Tipo de secuestro"
            chart={<EchartsChart option={barOption(dashboard.byKidnappingType, 'kidnappingType')} ariaLabel="Hechos por tipo de secuestro" />}
            rows={dashboard.byKidnappingType}
            columns={[
              { header: 'Tipo', cell: (row) => labelFor('kidnappingType', row.key) },
              { header: 'Hechos', cell: (row) => row.count.toLocaleString('es-CO') },
            ]}
            getRowKey={(row) => row.key}
          />
        </>
      )}

      {/*
        SPEC-0807: la ocupación de la víctima es una de las columnas que el
        analista llena a mano en el Excel y que hasta ahora viajaba hasta la base
        para no volver a salir nunca. Si el corte no la trae, la gráfica no se
        dibuja: una gráfica vacía dice "no hubo", y aquí sería "no se registró".
      */}
      {(dashboard.byOccupation ?? []).length > 0 && (
        <ChartWithTable
          title="Ocupación de la víctima"
          chart={<EchartsChart option={barOption(dashboard.byOccupation ?? [], 'occupation')} ariaLabel="Hechos por ocupación de la víctima" />}
          rows={dashboard.byOccupation ?? []}
          columns={[
            { header: 'Ocupación', cell: (row) => row.key },
            { header: 'Hechos', cell: (row) => row.count.toLocaleString('es-CO') },
            { header: 'Participación', cell: (row) => shareOf(dashboard.byOccupation ?? [], row) },
          ]}
          getRowKey={(row) => row.key}
        />
      )}
    </div>
  )
}
