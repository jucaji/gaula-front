import { Link } from '@tanstack/react-router'
import { can } from '@/lib/permissions'
import { useSessionQuery } from '@/lib/auth/useSession'
import { FLEET_SECTIONS } from '@/lib/fleetSections'

/** Las pestañas del módulo de flota. La lista y su regla viven en `lib/fleetSections`. */
export function FleetNav() {
  const session = useSessionQuery()
  const roles = session.data?.roles ?? []
  const visibles = FLEET_SECTIONS.filter((s) => can('READ', s.resource, roles))

  // Con una sola sección accesible, una pestaña suelta no informa de nada:
  // ocupa sitio y sugiere que hay algo más donde no lo hay.
  if (visibles.length < 2) return null

  return (
    <nav className="mb-4 flex gap-1 border-b border-border" aria-label="Secciones de flota">
      {visibles.map(({ to, label }) => (
        <Link
          key={to}
          to={to}
          className="flex min-h-[var(--tap-min)] items-center border-b-2 border-transparent px-3 py-2 text-sm text-text-secondary transition-colors duration-instant hover:text-text-primary [&.active-link]:border-accent [&.active-link]:text-text-primary"
          activeProps={{ className: 'active-link' }}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
