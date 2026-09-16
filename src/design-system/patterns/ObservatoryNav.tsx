import { Link } from '@tanstack/react-router'
import { SnapshotBand } from './SnapshotBand'

const OBSERVATORY_LINKS = [
  { to: '/tableros', label: 'Tableros' },
  { to: '/observatorio/cifras-oficiales', label: 'Cifras oficiales' },
  { to: '/observatorio/hechos', label: 'Hechos' },
  { to: '/observatorio/cargue', label: 'Cargue' },
] as const

/**
 * Encabezado común del observatorio: la banda de vigencia (S13.FE.03) va
 * ARRIBA de la sub-navegación a propósito -- lo primero que se lee en
 * cualquiera de estas pantallas es de qué corte viene lo que se está mirando.
 */
export function ObservatoryNav({ showSnapshot = true }: { showSnapshot?: boolean }) {
  return (
    <div className="mb-4">
      {/* SPEC-0808: las cifras oficiales tienen su propio corte. La banda del registro
          de la Fiscalía encima de ellas afirmaría una fecha que no es la suya. */}
      {showSnapshot && <SnapshotBand />}
      <nav className="mt-3 flex gap-1 border-b border-border" aria-label="Secciones del observatorio">
        {OBSERVATORY_LINKS.map(({ to, label }) => (
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
    </div>
  )
}
