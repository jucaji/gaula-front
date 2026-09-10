import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  PhoneCall,
  FolderOpen,
  MapPinned,
  FileText,
  BarChart3,
  Database,
  Truck,
  ShieldCheck,
  UserCircle,
} from 'lucide-react'
import type { Session } from '@/lib/auth/session'
import { can } from '@/lib/permissions'
import type { RoleCode } from '@/lib/auth/roles'
import { firstFleetSectionFor } from '@/lib/fleetSections'
import { LogoutButton } from './LogoutButton'
import { ThemeToggle } from './ThemeToggle'
import { DensityToggle } from './DensityToggle'

interface NavItem {
  to: string
  label: string
  icon: typeof PhoneCall
  /**
   * Los recursos que dan acceso a este módulo. Basta con alcanzar UNO.
   *
   * <p>Existe porque Flota tiene dos secciones con permisos distintos
   * (docs/04 §2.4): la unidad administrativa ve el inventario y no la
   * operación; un analista, al revés. Con un solo recurso, la entrada del menú
   * habría que duplicarla o esconderla a la mitad de quienes sí tienen algo que
   * ver ahí.
   */
  resources: string[]
  /** Para módulos con secciones: adónde llevar según lo que el rol alcance. */
  landing?: (roles: RoleCode[]) => string | null
}

// docs/07 §2: la misma lista de rutas, filtrada por lo que el rol puede ver.
const NAV_ITEMS: NavItem[] = [
  { to: '/recepcion/llamadas', label: 'Recepción', icon: PhoneCall, resources: ['CALL'] },
  { to: '/casos', label: 'Casos', icon: FolderOpen, resources: ['CASE_FILE'] },
  { to: '/campo', label: 'Campo', icon: MapPinned, resources: ['CASE_FILE'] },
  { to: '/reportes', label: 'Reportes', icon: FileText, resources: ['OPERATIONAL_REPORT'] },
  { to: '/analitica', label: 'Analítica', icon: BarChart3, resources: ['ANALYTICS'] },
  { to: '/tableros', label: 'Observatorio', icon: Database, resources: ['OBSERVATORY'] },
  // UNA entrada de flota con dos secciones dentro, no dos módulos separados:
  // inventario (quién tiene qué vehículo) y comando (dónde están) son el mismo
  // módulo mirado desde dos sitios. Los permisos siguen siendo distintos
  // (docs/04 §2.4) y por eso el destino depende del rol: la unidad
  // administrativa entra al inventario, un analista al comando.
  {
    to: '/recursos/flota',
    label: 'Flota',
    icon: Truck,
    resources: ['FLEET', 'VEHICLE_TELEMETRY'],
    landing: firstFleetSectionFor,
  },
  { to: '/admin/usuarios', label: 'Administración', icon: ShieldCheck, resources: ['ADMIN'] },
]

export function AppShell({ children, session }: { children: ReactNode; session: Session }) {
  const visibleItems = NAV_ITEMS
    .filter((item) => item.resources.some((resource) => can('READ', resource, session.roles)))
    // El destino de un módulo con secciones es la PRIMERA que el rol alcanza.
    // Llevar a todos al inventario mandaría al analista a una pantalla que el
    // backend le deniega -- ofrecer lo que se va a negar es peor que no
    // ofrecerlo.
    .map((item) => ({ ...item, to: item.landing?.(session.roles) ?? item.to }))

  return (
    // HALLAZGO REAL (2026-09-08, midiendo la consola a 375 px): la barra lateral
    // tenía ancho FIJO en todos los tamaños, así que en un teléfono se comía la
    // pantalla -- el contenido quedaba en columnas de 12 px y el documento entero
    // desbordaba en horizontal. En móvil la navegación pasa arriba, en una fila
    // que se desplaza; a partir de `md` vuelve a ser la barra lateral de siempre.
    <div className="grid min-h-dvh grid-rows-[var(--layout-header-height)_auto_1fr] md:grid-cols-[var(--layout-sidebar-width)_1fr] md:grid-rows-[var(--layout-header-height)_1fr]">
      {/* `min-w-0` en la cabecera y en la barra: sin eso, sus hijos imponen su
          ancho mínimo, estiran la rejilla entera y el DOCUMENTO desborda en
          horizontal -- que es lo que pasaba a 375 px. */}
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 md:col-span-2 md:px-4">
        <span className="truncate font-mono text-sm font-medium text-text-primary">GAULA DIGITAL</span>
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          {/* La densidad regula el alto de fila de las tablas: en un teléfono no
              hay tabla que valga la pena densificar, y sus tres botones eran lo
              que empujaba fuera al botón de salir. */}
          <span className="hidden sm:contents">
            <DensityToggle />
          </span>
          <ThemeToggle />
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <UserCircle size={20} strokeWidth={1.5} />
            {/* El nombre se oculta en pantallas angostas: el icono ya identifica
                la sesión y el nombre completo empujaba fuera al botón de salir. */}
            <span className="hidden lg:inline">{session.displayName}</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <nav
        className="min-w-0 overflow-x-auto border-b border-border bg-surface p-2 md:overflow-visible md:border-b-0 md:border-r"
        aria-label="Navegación principal"
      >
        <ul className="flex gap-1 md:flex-col md:gap-0.5">
          {visibleItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                // HALLAZGO REAL (axe-core, S14.FE.05): `text-accent` (pine-600) sobre
                // `bg-accent-subtle` (pine-50) da 4.24:1 -- por debajo del 4.5:1 de
                // WCAG AA. Afectaba al elemento activo del menú en TODAS las páginas y
                // nadie lo había visto porque el escaneo de humo corre en `/`, donde
                // ningún elemento del menú está activo. `accent-hover` es más oscuro en
                // claro y más claro en oscuro: sube el contraste en los dos temas.
                className="flex items-center gap-2 whitespace-nowrap rounded-sm px-3 py-2 text-sm min-h-[var(--tap-min)] min-w-[var(--tap-min)]  text-text-secondary transition-colors duration-instant hover:bg-surface-sunken hover:text-text-primary [&.active-link]:bg-accent-subtle [&.active-link]:text-accent-hover"
                activeProps={{ className: 'active-link' }}
              >
                <Icon size={16} strokeWidth={1.5} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <main className="min-w-0 overflow-auto bg-canvas p-4 md:p-6">{children}</main>
    </div>
  )
}
