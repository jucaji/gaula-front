import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from './Badge'

const meta: Meta<typeof Badge> = {
  title: 'Primitivos/Badge',
  component: Badge,
  args: { children: 'Etiqueta' },
  argTypes: {
    tone: { control: 'select', options: ['neutral', 'accent', 'critical', 'alert', 'active', 'stable'] },
  },
}

export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = {}

export const TodosLosTonos: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="neutral">Neutral</Badge>
      <Badge tone="accent">Accent</Badge>
      <Badge tone="critical">Critical</Badge>
      <Badge tone="alert">Alert</Badge>
      <Badge tone="active">Active</Badge>
      <Badge tone="stable">Stable</Badge>
    </div>
  ),
}
