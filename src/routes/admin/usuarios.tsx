import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { customFetch } from '@/api/client'
import type { AppUserResponse, PageResponseAppUserResponse } from '@/api/generated/models'
import { DataTable } from '@/design-system/primitives/DataTable'
import { AdminNav } from '@/design-system/patterns/AdminNav'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import type { RoleCode } from '@/lib/auth/roles'

export const Route = createFileRoute('/admin/usuarios')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'ADMIN')) {
      throw redirect({ to: '/', search: { denied: 'ADMIN' } })
    }
  },
  component: AdminUsersPage,
})

const ALL_ROLES: RoleCode[] = [
  'HOTLINE_OPERATOR',
  'INTELLIGENCE_ANALYST',
  'FIELD_OFFICER',
  'ADMIN_STAFF',
  'PREVENTION_STAFF',
  'UNIT_COMMANDER',
  'SYSTEM_ADMIN',
]

/** Mismo hallazgo de Pageable que en /casos (Orval no aplana el parámetro) -- query armada a mano. */
function useAppUsers(page: number, size: number) {
  return useQuery({
    queryKey: ['admin', 'users', 'search', page, size],
    queryFn: () => customFetch<PageResponseAppUserResponse>(`/api/v1/admin/users?page=${page}&size=${size}`),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function displayName(user: AppUserResponse): string {
  const parts = [user.rank, user.firstName, user.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : '—'
}

function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useAppUsers(0, 50)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  async function toggleRole(user: AppUserResponse, role: RoleCode) {
    if (!user.id) return
    setPendingUserId(user.id)
    const hasRole = user.roles?.includes(role) ?? false
    try {
      await customFetch(`/api/v1/admin/users/${user.id}/roles/${role}`, { method: hasRole ? 'DELETE' : 'PUT' })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'search'] })
    } finally {
      setPendingUserId(null)
    }
  }

  async function toggleActive(user: AppUserResponse) {
    if (!user.id) return
    setPendingUserId(user.id)
    try {
      await customFetch(`/api/v1/admin/users/${user.id}/active`, {
        method: 'PUT',
        body: JSON.stringify({ active: !user.active }),
      })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'search'] })
    } finally {
      setPendingUserId(null)
    }
  }

  const columns: ColumnDef<AppUserResponse, unknown>[] = [
    { id: 'name', header: 'Nombre', cell: ({ row }) => displayName(row.original) },
    { id: 'militaryId', accessorKey: 'militaryId', header: 'Identificación' },
    {
      id: 'roles',
      header: 'Roles',
      enableSorting: false,
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex flex-wrap gap-1">
            {ALL_ROLES.map((role) => {
              const active = user.roles?.includes(role) ?? false
              return (
                <button
                  key={role}
                  type="button"
                  disabled={pendingUserId === user.id}
                  onClick={() => toggleRole(user, role)}
                  // `aria-pressed` porque esto es un interruptor, no una acción:
                  // sin él, un lector de pantalla lee «UNIT_COMMANDER» y no dice
                  // si lo tiene o no -- que es justo el dato.
                  aria-pressed={active}
                  aria-label={active ? `Revocar ${role}` : `Otorgar ${role}`}
                  className="rounded-sm transition-opacity duration-instant hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                  title={active ? `Revocar ${role}` : `Otorgar ${role}`}
                >
                  <Badge tone={active ? 'active' : 'neutral'}>{role}</Badge>
                </button>
              )
            })}
          </div>
        )
      },
    },
    {
      id: 'active',
      header: 'Estado',
      cell: ({ row }) => {
        const user = row.original
        return (
          <Button
            variant={user.active ? 'secondary' : 'danger'}
            size="sm"
            loading={pendingUserId === user.id}
            onClick={() => toggleActive(user)}
          >
            {user.active ? 'Activo' : 'Inactivo'}
          </Button>
        )
      },
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <AdminNav />
      <h1 className="text-lg font-semibold text-text-primary">Administración de usuarios</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-secondary">
        El alta ocurre sola en el primer login, <strong className="text-text-primary">sin ningún rol</strong>:
        los roles se conceden aquí, tocando las etiquetas de la columna «Roles». Un rol concedido surte efecto
        cuando la persona vuelve a iniciar sesión. Para definir hasta dónde llega cada rol, vaya a{' '}
        <Link to="/admin/roles" className="text-accent underline">
          Roles
        </Link>
        .
      </p>

      {isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-sm text-critical">
          {error instanceof Error ? error.message : 'No se pudo cargar la lista de usuarios.'}
        </p>
      )}

      {data && data.content && (
        <div className="mt-4 h-[600px]">
          <DataTable data={data.content} columns={columns} getRowId={(user) => user.id ?? ''} />
        </div>
      )}
    </div>
  )
}
