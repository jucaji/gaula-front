import { useEffect, useMemo, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { useVehicleTrips } from '@/lib/telemetry/useVehicleTelemetry'
import {
  GAP_THRESHOLD_SECONDS,
  useTripPlayback,
  useVehicleTrack,
  type PlaybackSpeed,
  type TrackPoint,
} from '@/lib/telemetry/useTripPlayback'
import { formatDateTime } from '@/lib/format/formatDateTime'
import { RANGOS, rangoDe, type RangoId } from '@/lib/telemetry/playbackRanges'

const SPEEDS: PlaybackSpeed[] = [1, 4, 16]

interface TripPlaybackPanelProps {
  vehicleId: string
  label: string
  rangoInicial?: RangoId
  onTrack: (points: TrackPoint[]) => void
  onPlayhead: (point: TrackPoint | null) => void
  onClose: () => void
}

/**
 * SPEC-0513: el visor de recorrido.
 *
 * <p>Reproduce un RANGO DE TIEMPO, no un trayecto: la pregunta operativa es
 * «¿dónde estuvo la camioneta el martes por la tarde?». La lista de trayectos
 * del rango está como atajo para saltar a uno.
 *
 * <p>El marcador avanza por posiciones REGISTRADAS y no interpola entre ellas:
 * suavizar inventaría un recorrido que nadie midió. Por eso, cuando entre dos
 * posiciones hay un hueco, se dice.
 */
export function TripPlaybackPanel({
  vehicleId,
  label,
  rangoInicial = 'hoy',
  onTrack,
  onPlayhead,
  onClose,
}: TripPlaybackPanelProps) {
  const [rango, setRango] = useState<RangoId>(rangoInicial)
  const { from, to } = useMemo(() => rangoDe(rango), [rango])

  const track = useVehicleTrack(vehicleId, from, to, true)
  const trips = useVehicleTrips(vehicleId, from, to, true)
  const points = useMemo(() => track.data ?? [], [track.data])
  const playback = useTripPlayback(points)

  // El mapa recibe la línea completa y el punto que se está mirando. Va en un
  // efecto y no en un `useMemo`: avisar al padre es un efecto, y hacerlo durante
  // el render deja al padre a medio pintar.
  const actual = playback.current
  useEffect(() => onTrack(points), [points, onTrack])
  useEffect(() => onPlayhead(actual), [actual, onPlayhead])

  const hueco = playback.current?.gapSeconds ?? null
  const huecoVisible = hueco !== null && hueco > GAP_THRESHOLD_SECONDS

  return (
    <section className="flex flex-col gap-3 border-t border-border bg-surface p-4" aria-label={`Recorrido de ${label}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Recorrido de {label}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {(Object.keys(RANGOS) as RangoId[]).map((id) => (
          <Button
            key={id}
            variant={rango === id ? 'primary' : 'ghost'}
            size="sm"
            aria-pressed={rango === id}
            onClick={() => setRango(id)}
          >
            {RANGOS[id]}
          </Button>
        ))}
      </div>

      {track.isLoading && <p className="text-sm text-text-secondary">Cargando el recorrido…</p>}
      {track.isError && <p className="text-sm text-critical">No se pudo cargar el recorrido.</p>}

      {!track.isLoading && points.length === 0 && (
        <p className="text-sm text-text-secondary">
          No hay posiciones en ese rango. El vehículo pudo estar sin reportar, o sin equipo instalado.
        </p>
      )}

      {points.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={playback.toggle}
              aria-label={playback.playing ? 'Pausar la reproducción' : 'Reproducir el recorrido'}
            >
              {playback.playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
              <span className="ml-1">{playback.playing ? 'Pausar' : 'Reproducir'}</span>
            </Button>

            <label className="flex items-center gap-2 text-xs text-text-secondary">
              Velocidad
              <select
                value={playback.speed}
                onChange={(event) => playback.setSpeed(Number(event.target.value) as PlaybackSpeed)}
                className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
              >
                {SPEEDS.map((speed) => (
                  <option key={speed} value={speed}>
                    ×{speed}
                  </option>
                ))}
              </select>
            </label>

            <span className="text-xs text-text-secondary">
              {playback.index + 1} de {playback.total} posiciones
            </span>
          </div>

          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Momento del recorrido
            <Input
              type="range"
              min={0}
              max={Math.max(points.length - 1, 0)}
              value={playback.index}
              onChange={(event) => playback.goTo(Number(event.target.value))}
              className="h-6 px-0"
            />
          </label>

          {playback.current && (
            <p className="text-sm text-text-primary">
              {formatDateTime(playback.current.recordedAt)}{' '}
              <span className="text-text-secondary">
                · {playback.current.latitude.toFixed(5)}, {playback.current.longitude.toFixed(5)}
              </span>
              {huecoVisible && (
                <span className="ml-2 text-alert">
                  Hueco de {Math.round((hueco as number) / 60)} min sin reportar antes de este punto
                </span>
              )}
            </p>
          )}
        </>
      )}

      {(trips.data?.content?.length ?? 0) > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-text-primary">
            Trayectos del rango ({trips.data?.content?.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
            {(trips.data?.content ?? []).map((trip) => (
              <li key={trip.id}>
                {formatDateTime(trip.startedAt)} →{' '}
                {trip.endedAt ? formatDateTime(trip.endedAt) : 'en curso'}
                {trip.distanceMeters?.value != null && (
                  <span className="text-text-muted"> · {(trip.distanceMeters.value / 1000).toFixed(1)} km</span>
                )}
                <span className="text-text-muted"> · {trip.fixCount} posiciones</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
