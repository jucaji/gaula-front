import { useMemo, useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from 'lucide-react'
import clsx from 'clsx'
import { useDensityStore, DENSITY_ROW_HEIGHT } from '@/design-system/tokens/density'
import { Checkbox } from './Checkbox'

const SELECTION_COLUMN_ID = '__selection'

export interface DataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  getRowId: (row: TData) => string
  /** Si se pasa, agrega la columna de checkboxes y reporta la selección hacia arriba. */
  onSelectionChange?: (selectedIds: string[]) => void
  className?: string
}

/**
 * docs/06 §7.1 / S1.FE.03: `DataTable` -- virtualizada (TanStack Virtual,
 * nunca N filas reales en el DOM), densidad (alto de fila de
 * `useDensityStore`, reactivo al `DensityToggle` del header), orden
 * (clic en encabezado), columnas configurables (menú "Columnas") y
 * selección múltiple (checkbox por fila + "seleccionar todo").
 *
 * La exportación auditada del inventario de docs/06 §7.1 queda para
 * cuando exista el endpoint real de exportación (no hay insumo aún).
 */
export function DataTable<TData>({ data, columns, getRowId, onSelectionChange, className }: DataTableProps<TData>) {
  const density = useDensityStore((state) => state.density)
  const rowHeight = DENSITY_ROW_HEIGHT[density]

  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelectionState] = useState<RowSelectionState>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = (updater) => {
    setRowSelectionState((old) => {
      const next = typeof updater === 'function' ? updater(old) : updater
      onSelectionChange?.(Object.keys(next).filter((id) => next[id]))
      return next
    })
  }

  const columnsWithSelection = useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!onSelectionChange) return columns
    const selectionColumn: ColumnDef<TData, unknown> = {
      id: SELECTION_COLUMN_ID,
      size: 36,
      header: ({ table }) => (
        <Checkbox
          label="Seleccionar todas las filas"
          checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false}
          onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          label={`Seleccionar fila ${row.id}`}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
        />
      ),
    }
    return [selectionColumn, ...columns]
  }, [columns, onSelectionChange])

  const table = useReactTable({
    data,
    columns: columnsWithSelection,
    getRowId,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: handleRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: !!onSelectionChange,
  })

  const rows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  })

  const virtualRows = virtualizer.getVirtualItems()
  const totalHeight = virtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0
  const paddingBottom = virtualRows.length > 0 ? totalHeight - (virtualRows[virtualRows.length - 1]?.end ?? 0) : 0

  return (
    <div className={clsx('flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border', className)}>
      <div className="flex items-center justify-end border-b border-border bg-surface-sunken px-2 py-1">
        <ColumnVisibilityMenu table={table} />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border text-left text-xs text-text-muted">
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort()
                  const sortState = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className="py-2 pr-4 pl-2 font-medium"
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-text-primary"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortState === 'asc' && <ArrowUp size={12} strokeWidth={2} aria-hidden />}
                          {sortState === 'desc' && <ArrowDown size={12} strokeWidth={2} aria-hidden />}
                          {!sortState && <ArrowUpDown size={12} strokeWidth={1.5} className="text-text-muted/60" aria-hidden />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr aria-hidden style={{ height: paddingTop }}>
                <td colSpan={columnsWithSelection.length} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null
              return (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className="border-b border-border data-[state=selected]:bg-accent-subtle"
                  style={{ height: rowHeight }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="py-1 pr-4 pl-2 text-text-secondary">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
            {paddingBottom > 0 && (
              <tr aria-hidden style={{ height: paddingBottom }}>
                <td colSpan={columnsWithSelection.length} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ColumnVisibilityMenu<TData>({ table }: { table: ReturnType<typeof useReactTable<TData>> }) {
  const hideableColumns = table.getAllLeafColumns().filter((column) => column.id !== SELECTION_COLUMN_ID && column.getCanHide())
  if (hideableColumns.length === 0) return null

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xs px-2 py-1 text-xs text-text-secondary hover:bg-surface hover:text-text-primary"
        >
          <Columns3 size={14} strokeWidth={1.5} />
          Columnas
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="min-w-40 rounded-sm border border-border-strong bg-surface-raised p-1 text-sm shadow-sm"
        >
          {hideableColumns.map((column) => (
            <DropdownMenu.CheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(checked) => column.toggleVisibility(checked)}
              className="flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-text-primary outline-none data-[highlighted]:bg-surface-sunken"
              onSelect={(event) => event.preventDefault()}
            >
              <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
              {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
