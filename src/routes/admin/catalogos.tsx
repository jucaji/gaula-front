import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { customFetch } from '@/api/client'
import type { ImportMunicipalityRoutingResponse } from '@/api/generated/models'
import { AdminNav } from '@/design-system/patterns/AdminNav'
import { Button } from '@/design-system/primitives/Button'

export const Route = createFileRoute('/admin/catalogos')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'ADMIN')) {
      throw redirect({ to: '/', search: { denied: 'ADMIN' } })
    }
  },
  component: AdminCatalogsPage,
})

function AdminCatalogsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportMunicipalityRoutingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleImport() {
    if (!file) return
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await customFetch<ImportMunicipalityRoutingResponse>(
        '/api/v1/admin/catalog/municipality-routing/import',
        { method: 'POST', body: form },
      )
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar el archivo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <AdminNav />
      <h1 className="text-lg font-semibold text-text-primary">Importar enrutamiento territorial</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-secondary">
        CSV con columnas <code className="font-mono text-xs">municipalityCode,territorialUnitCode,effectiveDate</code>{' '}
        (fecha ISO). Una fila con datos malos se reporta y no afecta al resto del archivo.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-sm text-text-secondary file:mr-3 file:rounded-sm file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-sm file:text-text-primary"
        />
        <Button variant="primary" size="md" disabled={!file} loading={uploading} onClick={handleImport}>
          Importar
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}

      {result && (
        <div className="mt-4">
          <p className="text-sm text-text-primary">
            <span className="font-medium text-stable">{result.importedCount}</span> fila(s) importada(s) correctamente.
          </p>

          {result.errors && result.errors.length > 0 && (
            <table className="mt-3 w-full max-w-3xl border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-secondary">
                  <th className="py-2 pr-4 font-medium">Fila</th>
                  <th className="py-2 pr-4 font-medium">Contenido</th>
                  <th className="py-2 pr-4 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((rowError) => (
                  <tr key={rowError.rowNumber} className="border-b border-border align-top">
                    <td className="py-1.5 pr-4 text-text-secondary">{rowError.rowNumber}</td>
                    <td className="py-1.5 pr-4 font-mono text-xs text-text-muted">{rowError.rawLine}</td>
                    <td className="py-1.5 pr-4 text-critical">{rowError.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
