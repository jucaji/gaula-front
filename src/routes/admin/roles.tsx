import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { customFetch } from '@/api/client'
import type { AccessPolicyResponse } from '@/api/generated/models'
import { UpdateAccessPolicyRequestNewScope } from '@/api/generated/models'
import { AdminNav } from '@/design-system/patterns/AdminNav'

export const Route = createFileRoute('/admin/roles')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'ADMIN')) {
      throw redirect({ to: '/', search: { denied: 'ADMIN' } })
    }
  },
  component: AdminRolesPage,
})

const SCOPES = Object.values(UpdateAccessPolicyRequestNewScope)

function useAccessMatrix() {
  return useQuery({
    queryKey: ['admin', 'access-policies', 'matrix'],
    queryFn: () => customFetch<AccessPolicyResponse[]>('/api/v1/admin/access-policies/matrix'),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function AdminRolesPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useAccessMatrix()
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const { roles, columns, cellByKey } = useMemo(() => {
    const policies = data ?? []
    const roleSet = new Set<string>()
    const columnSet = new Set<string>()
    const byKey = new Map<string, AccessPolicyResponse>()

    for (const policy of policies) {
      if (!policy.roleCode || !policy.resourceType || !policy.action) continue
      roleSet.add(policy.roleCode)
      columnSet.add(`${policy.resourceType}:${policy.action}`)
      byKey.set(`${policy.roleCode}:${policy.resourceType}:${policy.action}`, policy)
    }

    return {
      roles: [...roleSet].sort(),
      columns: [...columnSet].sort().map((key) => {
        const [resourceType, action] = key.split(':')
        return { resourceType: resourceType ?? '', action: action ?? '' }
      }),
      cellByKey: byKey,
    }
  }, [data])

  async function changeScope(roleCode: string, resourceType: string, action: string, newScope: string) {
    const key = `${roleCode}:${resourceType}:${action}`
    setPendingKey(key)
    try {
      await customFetch('/api/v1/admin/access-policies', {
        method: 'PUT',
        body: JSON.stringify({ roleCode, resourceType, action, newScope }),
      })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'access-policies', 'matrix'] })
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <div>
      <AdminNav />
      <h1 className="text-lg font-semibold text-text-primary">Matriz de acceso</h1>
      {/* Las dos pantallas se confunden, y con razón: las dos hablan de roles.
          Ésta dice qué puede un ROL; «Usuarios» dice qué rol tiene una PERSONA.
          Sin esta línea, quien viene a dar un permiso a alguien se queda aquí
          cambiando alcances que no le van a servir. */}
      <p className="mt-1 max-w-2xl text-sm text-text-secondary">
        Aquí se define <strong className="text-text-primary">hasta dónde llega cada rol</strong>: qué alcance tiene
        sobre cada recurso. Para decidir <strong className="text-text-primary">qué rol tiene una persona</strong>,
        vaya a{' '}
        <Link to="/admin/usuarios" className="text-accent underline">
          Usuarios
        </Link>
        .
      </p>
      <p className="mt-2 max-w-2xl rounded-sm border border-alert bg-surface-sunken px-3 py-2 text-sm text-alert">
        Esta matriz es una hipótesis del proveedor por validar, no un hecho verificado en campo. Editarla no requiere
        desplegar, pero cada cambio queda auditado.
      </p>

      {isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-sm text-critical">
          {error instanceof Error ? error.message : 'No se pudo cargar la matriz de acceso.'}
        </p>
      )}

      {data && (
        <div className="mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken text-left text-xs text-text-secondary">
                <th className="py-2 pr-4 pl-3 font-medium">Rol</th>
                {columns.map((col) => (
                  <th key={`${col.resourceType}:${col.action}`} className="py-2 pr-4 font-medium">
                    {col.resourceType} · {col.action}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role} className="border-b border-border" style={{ height: 'var(--density-row)' }}>
                  <td className="py-1 pr-4 pl-3 font-medium text-text-primary">{role}</td>
                  {columns.map((col) => {
                    const key = `${role}:${col.resourceType}:${col.action}`
                    const policy = cellByKey.get(key)
                    if (!policy) {
                      return (
                        <td key={key} className="py-1 pr-4 text-text-muted">
                          —
                        </td>
                      )
                    }
                    return (
                      <td key={key} className="py-1 pr-4">
                        <select
                          value={policy.scope}
                          disabled={pendingKey === key}
                          onChange={(event) => changeScope(role, col.resourceType, col.action, event.target.value)}
                          className="rounded-xs border border-border-strong bg-surface px-1.5 py-1 text-xs text-text-primary disabled:opacity-50"
                        >
                          {SCOPES.map((scope) => (
                            <option key={scope} value={scope}>
                              {scope}
                            </option>
                          ))}
                        </select>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
