import { Link } from '@tanstack/react-router'

const ADMIN_LINKS = [
  { to: '/admin/usuarios', label: 'Usuarios' },
  { to: '/admin/roles', label: 'Roles' },
  { to: '/admin/catalogos', label: 'Catálogos' },
  { to: '/admin/auditoria', label: 'Auditoría' },
] as const

/** Sub-navegación de /admin/* -- las 4 pantallas administrativas comparten esta barra. */
export function AdminNav() {
  return (
    <nav className="mb-4 flex gap-1 border-b border-border" aria-label="Secciones de administración">
      {ADMIN_LINKS.map(({ to, label }) => (
        <Link
          key={to}
          to={to}
          className="border-b-2 border-transparent px-3 py-2 text-sm text-text-secondary transition-colors duration-instant hover:text-text-primary [&.active-link]:border-accent [&.active-link]:text-text-primary"
          activeProps={{ className: 'active-link' }}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
