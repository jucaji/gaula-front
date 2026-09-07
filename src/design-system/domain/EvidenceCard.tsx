import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Copy, Download, File, Image as ImageIcon, Music, Phone, Video } from 'lucide-react'
import { customFetch } from '@/api/client'
import type { ChainOfCustodyResponse, EvidenceResponse } from '@/api/generated/models'
import { formatBytes, formatDateTime } from '@/lib/format/formatDateTime'

const TYPE_ICON: Record<string, typeof File> = {
  PHOTO: ImageIcon,
  SCREENSHOT: ImageIcon,
  VIDEO: Video,
  AUDIO: Music,
  CDR: Phone,
  DOCUMENT: File,
}

function useCustodyChain(evidenceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['evidence', 'custody', evidenceId],
    queryFn: () => customFetch<ChainOfCustodyResponse[]>(`/api/v1/evidence/${evidenceId}/custody`),
    enabled,
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

/** S3.FE.02: miniatura por tipo, tamaño, hash verificado y custodia desplegable. */
export function EvidenceCard({ evidence }: { evidence: EvidenceResponse }) {
  const [expanded, setExpanded] = useState(false)
  const { data: custody, isLoading, isError } = useCustodyChain(evidence.id ?? '', expanded)
  const [copied, setCopied] = useState(false)
  const Icon = TYPE_ICON[evidence.evidenceType ?? ''] ?? File

  async function handleCopyHash() {
    if (!evidence.sha256) return
    try {
      await navigator.clipboard.writeText(evidence.sha256)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // portapapeles no disponible -- no hay nada más que ofrecer
    }
  }

  return (
    <div className="rounded-sm border border-border-strong bg-surface p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xs bg-surface-sunken">
          <Icon size={18} className="text-text-secondary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{evidence.originalFilename ?? '—'}</p>
          <p className="text-2xs text-text-muted">
            {evidence.evidenceType} · {formatBytes(evidence.sizeBytes)} · {formatDateTime(evidence.createdAt)}
          </p>
          <div className="mt-1 flex items-center gap-1">
            <code className="truncate text-2xs text-text-muted">{evidence.sha256}</code>
            <button
              type="button"
              onClick={handleCopyHash}
              className="shrink-0 text-text-muted hover:text-text-primary"
              aria-label="Copiar hash SHA-256"
            >
              <Copy size={11} />
            </button>
            {copied && <span className="text-2xs text-stable">Copiado</span>}
          </div>
        </div>
        <a
          href={`/api/v1/evidence/${evidence.id}/download`}
          className="shrink-0 text-text-muted hover:text-text-primary"
          aria-label="Descargar evidencia"
        >
          <Download size={16} />
        </a>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-2 flex items-center gap-1 text-2xs font-medium text-accent hover:text-accent-hover"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Cadena de custodia
      </button>

      {expanded && (
        <div className="mt-2 border-t border-border pt-2">
          {isLoading && <p className="text-2xs text-text-secondary">Cargando…</p>}
          {isError && <p className="text-2xs text-critical">No se pudo cargar la cadena de custodia.</p>}
          {custody && custody.length === 0 && <p className="text-2xs text-text-secondary">Sin eventos registrados.</p>}
          {custody && custody.length > 0 && (
            <ul className="flex flex-col gap-1">
              {custody.map((entry) => (
                <li key={entry.id} className="text-2xs text-text-secondary">
                  <span className="font-medium text-text-primary">{entry.eventType}</span> — {formatDateTime(entry.occurredAt)}
                  {entry.tampered && <span className="ml-1 text-critical">(hash no coincide)</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
