import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { ObservatoryDashboardScreen } from '@/design-system/domain/ObservatoryDashboardScreen'

const dashboardSearchSchema = z.object({
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  authorGroup: z.string().optional().catch(undefined),
  municipalityCode: z.string().optional().catch(undefined),
  // SPEC-0807: el resto de dimensiones que el dato ya sabía responder.
  departmentText: z.string().optional().catch(undefined),
  modality: z.string().optional().catch(undefined),
  kidnappingType: z.string().optional().catch(undefined),
  victimStatus: z.string().optional().catch(undefined),
  occupation: z.string().optional().catch(undefined),
})

/**
 * S14.FE.04 — el drill-down como RUTA (SPEC-0803 CA-4).
 *
 * <p>El parámetro es el TEXTO del departamento y no un código DIVIPOLA:
 * `observatory` resuelve el municipio a código pero conserva el departamento
 * como venía en el archivo (SPEC-0801 CA-3), y no hay tabla de departamentos
 * que permita resolverlo sin inventar. Usar aquí un código obligaría a adivinar
 * exactamente lo que el módulo se niega a adivinar.
 */
export const Route = createFileRoute('/tableros/extorsion/$department')({
  validateSearch: dashboardSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'OBSERVATORY')) {
      throw redirect({ to: '/', search: { denied: 'OBSERVATORY' } })
    }
  },
  component: ExtortionByDepartmentPage,
})

function ExtortionByDepartmentPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { department } = Route.useParams()

  return (
    <ObservatoryDashboardScreen
      profile="EXTORTION"
      department={department}
      filters={{ ...search, departmentText: department }}
      onFiltersChange={(filters) =>
        void navigate({ search: { from: filters.from, to: filters.to, authorGroup: filters.authorGroup, municipalityCode: filters.municipalityCode } })
      }
    />
  )
}
