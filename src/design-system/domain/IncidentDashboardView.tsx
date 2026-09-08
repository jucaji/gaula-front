import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ChartWithTable } from '@/design-system/patterns/ChartWithTable'
import { EchartsChart } from '@/design-system/charts/EchartsChart'
import {
  barOption as buildBarOption,
  donutOption as buildDonutOption,
  labelFor,
  monthlyOption as buildMonthlyOption,
  shareOf,
  yearlyOption as buildYearlyOption,
} from '@/design-system/charts/observatoryOptions'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import type { Breakdown, IncidentDashboard, IncidentProfile } from '@/lib/observatory/types'

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

  const monthlyOption = useMemo(() => buildMonthlyOption(dashboard.monthly, { theme }), [dashboard.monthly, theme])
  const yearlyOption = useMemo(() => buildYearlyOption(dashboard.yearly, { theme }), [dashboard.yearly, theme])
  const barOption = (rows: Breakdown[], dimension: string) => buildBarOption(rows, dimension, { theme })
  const donutOption = (rows: Breakdown[], dimension: string) => buildDonutOption(rows, dimension, { theme })

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
