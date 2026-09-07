import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { CaseFileResponse } from '@/api/generated/models'
import { CaseStatusChip } from '@/design-system/domain/CaseStatusChip'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { OfflineBanner } from '@/design-system/patterns/OfflineBanner'

export const Route = createFileRoute('/campo/')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'CASE_FILE')) {
      throw redirect({ to: '/', search: { denied: 'CASE_FILE' } })
    }
  },
  component: FieldCasesPage,
})

interface PageResponseCaseFile {
  content?: CaseFileResponse[]
}

/**
 * S8.FE.02 (docs/06 §8.3): una sola columna. El backend ya filtra a "mis
 * casos asignados" para FIELD_OFFICER vía `AccessContext` (verificado en
 * Sprint 2/3) -- este `GET` sin parámetros no es un descuido, es lo que
 * corresponde pedir.
 */
function useFieldCases() {
  return useQuery({
    queryKey: ['case-files', 'campo'],
    queryFn: () => customFetch<PageResponseCaseFile>('/api/v1/case-files?page=0&size=50'),
    staleTime: 15_000,
    networkMode: 'always',
    retry: false,
  })
}

function FieldCasesPage() {
  const cases = useFieldCases()

  return (
    <div className="flex h-full flex-col">
      <OfflineBanner />
      <div className="p-3">
        <h1 className="text-lg font-semibold text-text-primary">Mis casos</h1>

        {cases.isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
        {cases.isError && <p className="mt-4 text-sm text-critical">No se pudo cargar la lista -- sin conexión, se sigue viendo lo último guardado en el navegador.</p>}
        {cases.data?.content && cases.data.content.length === 0 && (
          <EmptyState title="No tiene casos asignados" description="Cuando le asignen un caso, aparecerá aquí." />
        )}

        <ul className="mt-4 flex flex-col gap-2">
          {cases.data?.content?.map((caseFile) => (
            <li key={caseFile.trackingNumber}>
              <Link
                to="/campo/$trackingNumber"
                params={{ trackingNumber: caseFile.trackingNumber ?? '' }}
                className="flex min-h-11 flex-col gap-1 rounded-sm border border-border-strong bg-surface px-4 py-3 hover:bg-surface-sunken"
              >
                <span className="font-mono text-sm font-medium text-text-primary">{caseFile.trackingNumber}</span>
                <span className="text-sm text-text-secondary">{caseFile.summary}</span>
                {caseFile.status && <CaseStatusChip status={caseFile.status} />}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
