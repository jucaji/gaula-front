import { useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Check, Copy } from 'lucide-react'

/**
 * docs/06 §7.2: radicado en monoespaciada, con copia al portapapeles y el
 * aviso de que esto NO es un número de noticia criminal -- confundirlos es
 * exactamente el tipo de error que un radicado dictable por radio busca
 * evitar en primer lugar.
 */
export function TrackingNumberBadge({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // portapapeles no disponible (contexto no seguro, permiso denegado) -- no hay nada más que ofrecer
    }
  }

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-xs border border-border-strong px-1.5 py-0.5 font-mono text-xs text-text-primary transition-colors duration-instant hover:bg-surface-sunken"
          >
            {value}
            {copied ? <Check size={12} strokeWidth={1.5} className="text-stable" /> : <Copy size={12} strokeWidth={1.5} />}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="max-w-64 rounded-sm border border-border-strong bg-surface-raised px-2 py-1.5 text-xs text-text-secondary shadow-sm"
            sideOffset={4}
          >
            {copied ? 'Copiado' : 'Radicado interno de seguimiento — no es un número de noticia criminal.'}
            <Tooltip.Arrow className="fill-surface-raised" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
