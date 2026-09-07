import type { ModusOperandiResponse } from '@/api/generated/models'

/**
 * S5.FE.02/03 (docs/06 §8.1 punto 6): tercera columna de la consola --
 * lectura pasiva, nunca exige interacción. Señales de alerta y
 * recomendaciones se filtran por tipología en `useModusOperandi`
 * (`recepcion/index.tsx`); este componente sólo pinta lo que llegue.
 */
export function ModusOperandiPanel({ items }: { items: ModusOperandiResponse[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((mo) => (
        <div key={mo.id} className="rounded-sm border border-border-strong p-2 text-sm">
          <p className="font-medium text-text-primary">{mo.name}</p>
          {(mo.warningSigns?.length ?? 0) > 0 && (
            <div className="mt-1">
              <p className="text-2xs font-semibold uppercase text-alert">⚠ Señales de alerta</p>
              <ul className="list-inside list-disc text-text-secondary">
                {mo.warningSigns?.map((sign) => (
                  <li key={sign}>{sign}</li>
                ))}
              </ul>
            </div>
          )}
          {(mo.recommendations?.length ?? 0) > 0 && (
            <div className="mt-1">
              <p className="text-2xs font-semibold uppercase text-text-muted">Qué indicarle</p>
              <ul className="list-inside list-disc text-text-secondary">
                {mo.recommendations?.map((rec) => (
                  <li key={rec}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
