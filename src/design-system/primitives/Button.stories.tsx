import type { Meta, StoryObj } from '@storybook/react-vite'
import { Save } from 'lucide-react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Primitivos/Button',
  component: Button,
  args: { children: 'Guardar' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'lg', 'touch'] },
  },
}

export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = { args: { variant: 'primary' } }
export const Secondary: Story = { args: { variant: 'secondary' } }
export const Ghost: Story = { args: { variant: 'ghost' } }
export const Danger: Story = { args: { variant: 'danger', children: 'Eliminar' } }
export const Loading: Story = { args: { variant: 'primary', loading: true } }
export const ConIcono: Story = {
  args: {
    variant: 'primary',
    children: (
      <>
        <Save size={16} strokeWidth={1.5} aria-hidden />
        Guardar
      </>
    ),
  },
}

export const TodosLosTamanos: Story = {
  render: (args) => (
    <div className="flex items-end gap-3">
      <Button {...args} size="sm">
        sm
      </Button>
      <Button {...args} size="md">
        md
      </Button>
      <Button {...args} size="lg">
        lg
      </Button>
      <Button {...args} size="touch">
        touch
      </Button>
    </div>
  ),
}

export const TodasLasVariantes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
}
