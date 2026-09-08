import { Link } from '@tanstack/react-router'
import { SnapshotBand } from './SnapshotBand'

const OBSERVATORY_LINKS = [
  { to: '/observatorio/hechos', label: 'Hechos' },
  { to: '/observatorio/cargue', label: 'Cargue' },
] as const

/**
 * Encabezado común del observatorio: la banda de vigencia (S13.FE.03) va
 * ARRIBA de la sub-navegación a propósito -- lo primero que se lee en
 * cualquiera de estas pantallas es de qué corte viene lo que se está mirando.
 */
export function ObservatoryNav() {
  return (
    <div className="mb-4">
      <SnapshotBand />
      <nav className="mt-3 flex gap-1 border-b border-border" aria-label="Secciones del observatorio">
        {OBSERVATORY_LINKS.map(({ to, label }) => (
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
    </div>
  )
}
