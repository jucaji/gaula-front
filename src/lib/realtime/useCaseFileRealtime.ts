import { useEffect } from 'react'
import { Client, type IMessage } from '@stomp/stompjs'
import type { QueryClient } from '@tanstack/react-query'

interface CaseFileChangedMessage {
  trackingNumber: string
}

const MIN_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 30_000

/** docs/07 §4: retroceso exponencial 1s→30s con *jitter* (±15%), no el reconnectDelay fijo de stompjs. */
function nextReconnectDelay(attempt: number): number {
  const exponential = Math.min(MAX_RECONNECT_DELAY_MS, MIN_RECONNECT_DELAY_MS * 2 ** attempt)
  return exponential * (0.85 + Math.random() * 0.3)
}

/**
 * docs/07 §4: "un solo WebSocket por sesión. Los eventos no traen datos:
 * traen una señal de invalidación." -- por eso este hook nunca lee el
 * contenido del mensaje más allá del radicado, y nunca escribe en la
 * caché de React Query directamente. Volver a pedir (`invalidateQueries`)
 * garantiza que lo que se pinta pasa de nuevo por `CaseFileAccessPolicy`
 * en el backend; aplicar el payload a ciegas sería una fuga de
 * compartimentación por el canal de tiempo real.
 */
export function useCaseFileRealtime(queryClient: QueryClient, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let attempt = 0
    let hasConnectedBefore = false
    let stopped = false
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const client = new Client({
      brokerURL: `${protocol}//${window.location.host}/ws`,
      reconnectDelay: 0,
      onConnect: () => {
        attempt = 0
        if (hasConnectedBefore) {
          // Reconexión tras una caída: pudo haber cambios durante la
          // desconexión que ningún mensaje individual va a reponer.
          void queryClient.invalidateQueries()
        }
        hasConnectedBefore = true

        client.subscribe('/topic/case-files', (message: IMessage) => {
          let payload: CaseFileChangedMessage
          try {
            payload = JSON.parse(message.body) as CaseFileChangedMessage
          } catch {
            return
          }
          if (!payload.trackingNumber) return

          void queryClient.invalidateQueries({ queryKey: ['case-files', 'search'] })
          void queryClient.invalidateQueries({ queryKey: ['case-files', 'detail', payload.trackingNumber] })
        })
      },
      onWebSocketClose: () => {
        if (stopped) return
        const delay = nextReconnectDelay(attempt)
        attempt += 1
        reconnectTimer = setTimeout(() => client.activate(), delay)
      },
    })

    client.activate()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      void client.deactivate()
    }
  }, [queryClient, enabled])
}
