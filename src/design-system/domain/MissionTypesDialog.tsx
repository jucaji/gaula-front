import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { Badge } from '@/design-system/primitives/Badge'
import { useMissionTypeMutations, useMissionTypes } from '@/lib/fleet/useFleetAdmin'
import type { MissionType } from '@/lib/fleet/types'

function errorOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * SPEC-0509 Decisión 3: el catálogo de tipos de misión, que gobierna el cliente.
 *
 * <p>El cliente no tenía la lista cuando se construyó y pidió poder crear,
 * editar y eliminar opciones desde un modal. Eliminar un tipo que alguna misión
 * ya usó no lo borra: lo ARCHIVA, y el modal lo dice — dejar creer que
 * desapareció sería mentir sobre el historial.
 *
 * <p>Sólo lo ve quien puede escribir en el catálogo (alcance nacional): el
 * backend rechazaría a cualquier otro, y un botón que lleva a un 403 es peor
 * que no tener botón.
 */
export function MissionTypesDialog({ triggerLabel = 'Tipos de misión' }: { triggerLabel?: string } = {}) {
  const [open, setOpen] = useState(false)
  const types = useMissionTypes(open)
  const { create } = useMissionTypeMutations()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" size="sm">{triggerLabel}</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-md border border-border-strong bg-surface-raised p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold text-text-primary">Tipos de misión</Dialog.Title>
              <Dialog.Description className="text-sm text-text-secondary">
                El catálogo es nacional: lo que cambie aquí lo verán todas las territoriales.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Cerrar" className="inline-flex min-h-[var(--tap-min)] min-w-[var(--tap-min)] items-center justify-center rounded-sm text-text-secondary hover:text-text-primary">
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <form
            className="flex flex-col gap-2 rounded-sm border border-border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void create.mutateAsync({ name, description })
                .then(() => { setName(''); setDescription('') })
                .catch(() => undefined)
            }}
          >
            <p className="text-sm font-semibold text-text-primary">Nuevo tipo</p>
            <label className="flex flex-col gap-1 text-sm text-text-primary">
              Nombre *
              <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-primary">
              Descripción
              <Input value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} />
            </label>
            {create.isError && <p className="text-sm text-critical">{errorOf(create.error, 'No se pudo crear.')}</p>}
            <div>
              <Button type="submit" variant="primary" size="sm" loading={create.isPending} disabled={name.trim() === ''}>
                Agregar
              </Button>
            </div>
          </form>

          {types.isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
          {types.isError && <p className="text-sm text-critical">No se pudo cargar el catálogo.</p>}
          <ul className="flex flex-col gap-2" aria-label="Tipos de misión registrados">
            {(types.data ?? []).map((type) => <MissionTypeRow key={type.id} type={type} />)}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function MissionTypeRow({ type }: { type: MissionType }) {
  const { edit, remove } = useMissionTypeMutations()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [name, setName] = useState(type.name)
  const [description, setDescription] = useState(type.description ?? '')
  const [outcome, setOutcome] = useState<string | null>(null)

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-sm border border-border p-3">
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Nombre *
          <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Descripción
          <Input value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {edit.isError && <p className="text-sm text-critical">{errorOf(edit.error, 'No se pudo guardar.')}</p>}
        <div className="flex gap-2">
          <Button variant="primary" size="sm" loading={edit.isPending} disabled={name.trim() === ''}
                  onClick={() => void edit.mutateAsync({ id: type.id, name, description })
                    .then(() => setEditing(false))
                    .catch(() => undefined)}>
            Guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border p-3">
      <div className="min-w-[10rem]">
        <p className="flex items-center gap-2 text-sm text-text-primary">
          {type.name}
          {!type.active && <Badge tone="neutral">Archivado</Badge>}
        </p>
        {type.description && <p className="text-xs text-text-secondary">{type.description}</p>}
        {outcome && <p className="text-xs text-text-secondary">{outcome}</p>}
      </div>

      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">¿Eliminar «{type.name}»?</span>
          <Button variant="danger" size="sm" loading={remove.isPending}
                  onClick={() => void remove.mutateAsync(type.id)
                    .then((result) => {
                      setConfirming(false)
                      // Lo que pasó de verdad: archivar no es borrar.
                      if (result.outcome === 'ARCHIVED') {
                        setOutcome('Se archivó: lo usan misiones anteriores. Ya no aparece al asignar.')
                      }
                    })
                    .catch(() => setConfirming(false))}>
            Sí, eliminar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>No</Button>
        </div>
      ) : (
        type.active && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Editar</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>Eliminar</Button>
          </div>
        )
      )}
    </li>
  )
}
