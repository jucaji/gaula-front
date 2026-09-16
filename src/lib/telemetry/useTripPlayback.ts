import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { PositionFixResponse } from './types'

/** La envoltura de página del backend, declarada aquí como en `useVehicleTelemetry`. */
interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  pageNumber: number
  pageSize: number
}

export interface TrackPoint {
  latitude: number
  longitude: number
  recordedAt: string
  /** Segundos desde la posición anterior. El primer punto no tiene hueco. */
  gapSeconds: number | null
}

export interface TripPathResponse {
  tripId: string
  vehicleId: string
  startedAt: string
  endedAt: string | null
  points: Array<{ latitude: number; longitude: number }>
}

/** Un hueco a partir de este tamaño se señala: entre esas dos posiciones no se sabe por dónde fue. */
export const GAP_THRESHOLD_SECONDS = 60

/** Tope de puntos a dibujar: más de esto no lo distingue la pantalla y sí lo sufre el navegador. */
const MAX_POINTS = 2000

/**
 * SPEC-0513: las posiciones de un rango, listas para reproducir.
 *
 * <p>Se traen de una vez y no mientras se reproduce: un día con una posición por
 * minuto son 1.440 puntos. La página del servidor es de 1.000, así que se piden
 * las que haga falta hasta completar el rango.
 */
export function useVehicleTrack(vehicleId: string | null, from: string, to: string, enabled: boolean) {
  return useQuery<TrackPoint[]>({
    queryKey: ['telemetry', 'track', vehicleId, from, to],
    queryFn: async () => {
      const fixes: PositionFixResponse[] = []
      for (let page = 0; page < 10; page += 1) {
        const params = new URLSearchParams({ from, to, page: String(page), size: '1000' })
        const response = await customFetch<PageResponse<PositionFixResponse>>(
          `/api/v1/telemetry/vehicles/${vehicleId}/history?${params.toString()}`,
        )
        fixes.push(...(response.content ?? []))
        if ((response.content?.length ?? 0) < 1000) break
      }
      return toTrack(fixes)
    },
    enabled: enabled && vehicleId !== null,
    staleTime: 30_000,
    networkMode: 'always',
    retry: false,
  })
}

/** El trazado guardado de un trayecto: la línea que PostGIS ya simplificó. */
export function useTripPath(vehicleId: string | null, tripId: string | null) {
  return useQuery<TripPathResponse>({
    queryKey: ['telemetry', 'trip-path', vehicleId, tripId],
    queryFn: () => customFetch<TripPathResponse>(`/api/v1/telemetry/vehicles/${vehicleId}/trips/${tripId}/path`),
    enabled: vehicleId !== null && tripId !== null,
    staleTime: 5 * 60_000,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * Ordena por reloj del proveedor, descarta las que no traen punto y calcula el
 * hueco contra la anterior. El historial llega de la más reciente a la más
 * vieja; reproducir va al revés.
 */
export function toTrack(fixes: PositionFixResponse[]): TrackPoint[] {
  const conPunto = fixes
    .filter((fix) => fix.latitude != null && fix.longitude != null)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))

  const muestreados = sample(conPunto, MAX_POINTS)

  return muestreados.map((fix, index) => {
    const anterior = muestreados[index - 1]
    return {
      latitude: fix.latitude as number,
      longitude: fix.longitude as number,
      recordedAt: fix.recordedAt,
      gapSeconds: anterior
        ? Math.round((new Date(fix.recordedAt).getTime() - new Date(anterior.recordedAt).getTime()) / 1000)
        : null,
    }
  })
}

/** Muestreo uniforme que CONSERVA los extremos: dónde empezó y dónde terminó no se pierden. */
function sample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const step = (items.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, index) => items[Math.round(index * step)] as T)
}

export type PlaybackSpeed = 1 | 4 | 16

/**
 * El reloj de la reproducción.
 *
 * <p>Avanza por posiciones REGISTRADAS, sin interpolar entre ellas: inventar
 * puntos intermedios para que se vea suave sería dibujar un recorrido que nadie
 * midió (misma doctrina que `speedSource` en SPEC-0506).
 */
export function useTripPlayback(points: TrackPoint[]) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(4)
  const timerRef = useRef<number | null>(null)
  // Un recorrido nuevo empieza desde el principio y en pausa. Se detecta
  // durante el render y no en un efecto: poner el estado dentro de un efecto
  // deja pintar un fotograma con el índice del recorrido ANTERIOR, que además
  // puede no existir en el nuevo.
  const [trackId, setTrackId] = useState(points)
  if (trackId !== points) {
    setTrackId(points)
    setIndex(0)
    setPlaying(false)
  }

  const total = points.length

  useEffect(() => {
    if (!playing || total === 0) return undefined
    // Un paso por cada posición: a ×1, una posición cada 600 ms. No se usa el
    // tiempo real entre posiciones porque un rango de ocho horas tardaría ocho
    // horas en reproducirse.
    const intervalo = Math.max(60, 600 / speed)
    timerRef.current = window.setInterval(() => {
      setIndex((previous) => {
        if (previous >= total - 1) {
          setPlaying(false)
          return previous
        }
        return previous + 1
      })
    }, intervalo)
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [playing, speed, total])

  const current = useMemo(() => points[Math.min(index, Math.max(total - 1, 0))] ?? null, [points, index, total])

  const goTo = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(next, Math.max(total - 1, 0))))
  }, [total])

  const toggle = useCallback(() => {
    if (total === 0) return
    setPlaying((previous) => {
      // Reanudar desde el final vuelve a empezar: es lo que espera quien pulsa
      // «reproducir» con la barra al tope.
      if (!previous && index >= total - 1) setIndex(0)
      return !previous
    })
  }, [index, total])

  return { index, current, playing, speed, setSpeed, goTo, toggle, total }
}
