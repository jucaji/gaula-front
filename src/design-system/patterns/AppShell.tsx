import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  PhoneCall,
  FolderOpen,
  MapPinned,
  FileText,
  BarChart3,
  Truck,
  ShieldCheck,
  UserCircle,
} from 'lucide-react'
import type { Session } from '@/lib/auth/session'
import { can } from '@/lib/permissions'
import { ThemeToggle } from './ThemeToggle'

interface NavItem {
  to: string
  label: string
  icon: typeof PhoneCall
  resource: string
}

// docs/07 §2: la misma lista de rutas, filtrada por lo que el rol puede ver.
const NAV_ITEMS: NavItem[] = [
  { to: '/recepcion/llamadas', label: 'Recepción', icon: PhoneCall, resource: 'CALL' },
  { to: '/casos', label: 'Casos', icon: FolderOpen, resource: 'CASE_FILE' },
  { to: '/campo', label: 'Campo', icon: MapPinned, resource: 'CASE_FILE' },
  { to: '/reportes', label: 'Reportes', icon: FileText, resource: 'OPERATIONAL_REPORT' },
  { to: '/analitica', label: 'Analítica', icon: BarChart3, resource: 'ANALYTICS' },
  { to: '/recursos/flota', label: 'Flota', icon: Truck, resource: 'FLEET' },
  { to: '/admin/usuarios', label: 'Administración', icon: ShieldCheck, resource: 'ADMIN' },
]

export function AppShell({ children, session }: { children: ReactNode; session: Session }) {
  const visibleItems = NAV_ITEMS.filter((item) => can('READ', item.resource, session.roles))

  return (
    <div className="grid min-h-dvh grid-cols-[var(--layout-sidebar-width)_1fr] grid-rows-[var(--layout-header-height)_1fr]">
      <header className="col-span-2 flex items-center justify-between border-b border-border bg-surface px-4">
        <span className="font-mono text-sm font-medium text-text-primary">GAULA DIGITAL</span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <UserCircle size={20} strokeWidth={1.5} />
            <span>{session.displayName}</span>
          </div>
        </div>
      </header>

      <nav className="border-r border-border bg-surface p-2" aria-label="Navegación principal">
        <ul className="flex flex-col gap-0.5">
          {visibleItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm text-text-secondary transition-colors duration-instant hover:bg-surface-sunken hover:text-text-primary [&.active-link]:bg-accent-subtle [&.active-link]:text-accent"
                activeProps={{ className: 'active-link' }}
              >
                <Icon size={16} strokeWidth={1.5} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <main className="overflow-auto bg-canvas p-6">{children}</main>
    </div>
  )
}
