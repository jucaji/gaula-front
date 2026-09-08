import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { ObservatoryDashboardScreen } from '@/design-system/domain/ObservatoryDashboardScreen'

/** SPEC-0803 CA-3: todo el estado del tablero vive aquí, en la URL. */
const dashboardSearchSchema = z.object({
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  authorGroup: z.string().optional().catch(undefined),
  municipalityCode: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/tableros/secuestro/')({
  validateSearch: dashboardSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'OBSERVATORY')) {
      throw redirect({ to: '/', search: { denied: 'OBSERVATORY' } })
    }
  },
  component: KidnappingDashboardPage,
})

function KidnappingDashboardPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <ObservatoryDashboardScreen
      profile="KIDNAPPING"
      filters={search}
      onFiltersChange={(filters) => void navigate({ search: filters })}
      departmentHref={(department) => ({ to: '/tableros/secuestro/$department', params: { department } })}
    />
  )
}
