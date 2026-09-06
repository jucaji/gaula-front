import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

/** docs/06 §7.2: siempre dice POR QUÉ está vacío y qué hacer -- nunca sólo un icono. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="mt-8 flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-12 text-center">
      <Inbox size={24} strokeWidth={1.5} className="text-text-muted" />
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="max-w-sm text-sm text-text-secondary">{description}</p>
      {action}
    </div>
  )
}
