import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from './DataTable'

interface DemoCase {
  id: string
  trackingNumber: string
  municipality: string
  crimeType: string
  openedAt: string
}

const MUNICIPALITIES = ['Bogotá', 'Medellín', 'Cali', 'Villavicencio', 'Cúcuta', 'Ibagué']
const CRIME_TYPES = ['Secuestro extorsivo', 'Extorsión', 'Secuestro simple']

function buildDemoData(count: number): DemoCase[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    trackingNumber: `GD-2026-${String(i + 1).padStart(6, '0')}`,
    municipality: MUNICIPALITIES[i % MUNICIPALITIES.length] ?? 'Bogotá',
    crimeType: CRIME_TYPES[i % CRIME_TYPES.length] ?? 'Extorsión',
    openedAt: new Date(2026, 0, 1 + (i % 28)).toLocaleDateString('es-CO'),
  }))
}

const columns: ColumnDef<DemoCase, unknown>[] = [
  { accessorKey: 'trackingNumber', header: 'Radicado' },
  { accessorKey: 'municipality', header: 'Municipio' },
  { accessorKey: 'crimeType', header: 'Tipología' },
  { accessorKey: 'openedAt', header: 'Apertura', enableSorting: false },
]

const meta: Meta<typeof DataTable<DemoCase>> = {
  title: 'Primitivos/DataTable',
  component: DataTable<DemoCase>,
}

export default meta
type Story = StoryObj<typeof DataTable<DemoCase>>

export const Basico: Story = {
  render: () => (
    <div style={{ height: 400 }}>
      <DataTable data={buildDemoData(20)} columns={columns} getRowId={(row) => row.id} />
    </div>
  ),
}

/** 5.000 filas -- si esto no se traba, la virtualización funciona de verdad. */
export const Virtualizada5000Filas: Story = {
  render: () => (
    <div style={{ height: 500 }}>
      <DataTable data={buildDemoData(5000)} columns={columns} getRowId={(row) => row.id} />
    </div>
  ),
}

export const ConSeleccionMultiple: Story = {
  render: function Render() {
    const [selected, setSelected] = useState<string[]>([])
    return (
      <div>
        <p className="mb-2 text-sm text-text-secondary">Seleccionadas: {selected.join(', ') || 'ninguna'}</p>
        <div style={{ height: 400 }}>
          <DataTable data={buildDemoData(50)} columns={columns} getRowId={(row) => row.id} onSelectionChange={setSelected} />
        </div>
      </div>
    )
  },
}
