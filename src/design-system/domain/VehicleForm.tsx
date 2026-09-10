import { Input } from '@/design-system/primitives/Input'
import type { TerritorialUnit, VehicleFormValues } from '@/lib/fleet/types'

interface Props {
  values: VehicleFormValues
  onChange: (values: VehicleFormValues) => void
  units: TerritorialUnit[]
  /**
   * En edición la unidad territorial NO se muestra: cambiarla cambia quién ve
   * el vehículo, y por eso es un traslado con su propia acción y su propia
   * comprobación (SPEC-0507 CA-5). Un campo deshabilitado habría sido peor que
   * su ausencia: sugiere que la corrección podría moverlo y que hoy no se
   * puede, cuando lo cierto es que nunca debe hacerlo desde aquí.
   */
  mode: 'create' | 'edit'
  disabled?: boolean
}

const FIELD = 'flex flex-col gap-1 text-sm text-text-primary'

export function VehicleForm({ values, onChange, units, mode, disabled }: Props) {
  function set<K extends keyof VehicleFormValues>(key: K, value: string) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <label className={`${FIELD} min-w-[8rem] flex-1`}>
          Placa *
          <Input
            value={values.plate}
            disabled={disabled}
            maxLength={10}
            autoComplete="off"
            onChange={(event) => set('plate', event.target.value)}
          />
          <span className="text-xs text-text-secondary">Se guarda sin espacios y en mayúsculas.</span>
        </label>
        <label className={`${FIELD} min-w-[8rem] flex-1`}>
          Tipo *
          <Input
            value={values.vehicleType}
            disabled={disabled}
            maxLength={30}
            placeholder="CAMIONETA, MOTO…"
            onChange={(event) => set('vehicleType', event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className={`${FIELD} min-w-[8rem] flex-1`}>
          Marca
          <Input value={values.make} disabled={disabled} maxLength={60}
                 onChange={(event) => set('make', event.target.value)} />
        </label>
        <label className={`${FIELD} min-w-[8rem] flex-1`}>
          Modelo
          <Input value={values.model} disabled={disabled} maxLength={60}
                 onChange={(event) => set('model', event.target.value)} />
        </label>
        <label className={`${FIELD} w-28`}>
          Año
          <Input type="number" inputMode="numeric" value={values.modelYear} disabled={disabled}
                 min={1950} max={2100} onChange={(event) => set('modelYear', event.target.value)} />
        </label>
      </div>

      {mode === 'create' && (
        <label className={FIELD}>
          Unidad territorial *
          <select
            value={values.territorialUnitId}
            disabled={disabled}
            onChange={(event) => set('territorialUnitId', event.target.value)}
            className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
          >
            <option value="">Seleccione…</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.code})
              </option>
            ))}
          </select>
          <span className="text-xs text-text-secondary">
            Determina quién puede ver este vehículo. Después sólo cambia con un traslado.
          </span>
        </label>
      )}
    </div>
  )
}
