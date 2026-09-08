import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { BarChart3, FileText, ShieldAlert, Users } from 'lucide-react'
import { ObservatoryNav } from '@/design-system/patterns/ObservatoryNav'
import { useActiveSnapshot } from '@/lib/observatory/useActiveSnapshot'

export const Route = createFileRoute('/tableros/')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'OBSERVATORY')) {
      throw redirect({ to: '/', search: { denied: 'OBSERVATORY' } })
    }
  },
  component: DashboardIndexPage,
})

const SECTIONS = [
  {
    to: '/tableros/extorsion',
    icon: ShieldAlert,
    title: 'Denuncias por extorsión',
    description: 'Modalidad, grupo autor, evolutivo mensual, comparativo anual y ranking territorial.',
  },
  {
    to: '/tableros/secuestro',
    icon: Users,
    title: 'Víctimas de secuestro',
    description: 'Situación de la víctima, tipo de secuestro, autores, evolutivo y municipios con más hechos.',
  },
  {
    to: '/tableros/boletin',
    icon: FileText,
    title: 'Boletín del corte',
    description: 'La lámina de cierre armada desde el dato vivo, con su procedencia. Descargable en PDF.',
  },
] as const

/**
 * S14.FE.01 — el índice de tableros, equivalente al `HOME COGAM` observado.
 *
 * <p>Es una página con secciones y no un menú lateral plano a propósito: quien
 * abre esto no siempre sabe qué tablero necesita, y una lista de enlaces sin
 * contexto obliga a entrar y salir hasta dar con el correcto.
 */
function DashboardIndexPage() {
  const { data: snapshot } = useActiveSnapshot()

  return (
    <div className="flex h-full flex-col">
      <ObservatoryNav />

      <h1 className="text-lg font-semibold text-text-primary">Tableros del observatorio</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-secondary">
        Todas las cifras de estas páginas vienen del corte declarado arriba
        {snapshot ? ` (${snapshot.incidentCount.toLocaleString('es-CO')} hechos)` : ''}. Cada gráfica tiene su tabla
        equivalente y cada filtro viaja en la dirección: compartir una vista es compartir el enlace.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="group flex flex-col gap-2 rounded-sm border border-border-strong bg-surface p-4 transition-colors duration-instant hover:border-accent"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Icon size={18} strokeWidth={1.5} className="text-accent" aria-hidden />
              {title}
            </span>
            <span className="text-sm text-text-secondary">{description}</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-sm border border-border bg-surface-raised p-3">
        <BarChart3 size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
        <p className="text-2xs text-text-secondary">
          Estos tableros miden el <span className="font-medium text-text-primary">registro nacional</span> (fuente
          Fiscalía): lo que pasa en el país. Lo que hizo el GAULA se mide en{' '}
          <Link to="/analitica" search={{}} className="text-accent hover:underline">
            Analítica
          </Link>
          , con otro origen y otro ciclo. No se suman.
        </p>
      </div>
    </div>
  )
}
