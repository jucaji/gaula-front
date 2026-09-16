import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { CrimeSheetScreen } from '@/design-system/domain/CrimeSheetScreen'

/**
 * SPEC-0809: la ficha de un delito sobre las cifras oficiales de Mindefensa.
 *
 * <p>El departamento viaja como código DIVIPOLA. El router lee `?departamento=05`
 * como el número 5 (hallazgo de SPEC-0108), por eso se vuelve a rellenar.
 */
const searchSchema = z.object({
  departamento: z.preprocess(
    (value) => (value === undefined || value === null || value === '' ? undefined : String(value).padStart(2, '0')),
    z.string().regex(/^\d{2}$/).optional(),
  ).catch(undefined),
  periodo: z.enum(['anio']).optional().catch(undefined),
})

export const Route = createFileRoute('/tableros/cifras-oficiales/$indicador')({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'OFFICIAL_STATISTIC')) {
      throw redirect({ to: '/', search: { denied: 'OFFICIAL_STATISTIC' } })
    }
  },
  component: CrimeSheetPage,
})

function CrimeSheetPage() {
  const { indicador } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { can } = Route.useRouteContext()

  return (
    <CrimeSheetScreen
      slug={indicador}
      departmentCode={search.departamento}
      period={search.periodo === 'anio' ? 'LAST_FULL_YEAR' : 'YEAR_TO_DATE'}
      canLoad={can('CREATE', 'OFFICIAL_STATISTIC')}
      onDepartmentChange={(departamento) => void navigate({ search: (previous) => ({ ...previous, departamento }) })}
      onPeriodChange={(period) => void navigate({ search: (previous) => ({ ...previous, periodo: period === 'LAST_FULL_YEAR' ? 'anio' : undefined }) })}
    />
  )
}
