import { useState } from 'react'
import { WifiOff, Wifi, RefreshCw } from 'lucide-react'
import { useSyncQueue } from '@/lib/offline/useSyncQueue'

/**
 * docs/06 §8.3: estado de red y cola de sincronización de forma PERMANENTE,
 * nunca un aviso pasajero -- "un operador que no sabe si su registro se
 * envió, vuelve a llamar por radio, y ahí se perdió la ganancia". Por la
 * misma razón "rechazado" no puede ser sólo un contador: el operador
 * necesita ver QUÉ se rechazó y por qué, y decidir si reintentar o
 * descartarlo -- un rechazo del servidor nunca se reintenta solo (mutationQueue.ts).
 */
export function OfflineBanner() {
  const { queue, online, lastSyncedAt, syncNow, retryFailed, discardFailed } = useSyncQueue()
  const [showFailed, setShowFailed] = useState(false)
  const pending = queue.filter((item) => item.status !== 'failed')
  const failed = queue.filter((item) => item.status === 'failed')

  return (
    <div className="relative">
      <div
        className={`flex items-center justify-between gap-3 border-b px-3 py-1.5 text-xs ${
          online ? 'border-border bg-surface-sunken text-text-secondary' : 'border-alert bg-surface-sunken text-alert'
        }`}
      >
        <span className="flex items-center gap-1.5">
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          {online ? 'En línea' : 'Sin conexión -- los registros se guardan localmente'}
        </span>
        <span className="flex items-center gap-3">
          {pending.length > 0 && <span>{pending.length} registro(s) en cola</span>}
          {failed.length > 0 && (
            <button type="button" onClick={() => setShowFailed((value) => !value)} className="font-medium text-critical underline decoration-dotted">
              {failed.length} rechazado(s) -- revisar
            </button>
          )}
          {pending.length === 0 && failed.length === 0 && lastSyncedAt && (
            <span>Todo sincronizado -- último envío {lastSyncedAt.toLocaleTimeString('es-CO')}</span>
          )}
          <button type="button" onClick={syncNow} className="flex items-center gap-1 hover:text-text-primary" aria-label="Sincronizar ahora">
            <RefreshCw size={12} />
          </button>
        </span>
      </div>

      {showFailed && failed.length > 0 && (
        <ul className="absolute right-0 z-10 flex w-80 flex-col gap-2 border border-border-strong bg-surface p-3 shadow-md">
          {failed.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 border-b border-border pb-2 last:border-0 last:pb-0">
              <span className="text-sm font-medium text-text-primary">{item.label}</span>
              <span className="text-xs text-critical">{item.lastError ?? 'El servidor rechazó este registro.'}</span>
              <span className="flex gap-3 text-xs">
                <button type="button" className="text-accent hover:underline" onClick={() => item.id !== undefined && retryFailed(item.id)}>
                  Reintentar
                </button>
                <button type="button" className="text-text-secondary hover:underline" onClick={() => item.id !== undefined && discardFailed(item.id)}>
                  Descartar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
