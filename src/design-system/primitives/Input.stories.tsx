import type { Meta, StoryObj } from '@storybook/react-vite'
import { Input } from './Input'

const meta: Meta<typeof Input> = {
  title: 'Primitivos/Input',
  component: Input,
  args: { placeholder: 'Número de teléfono' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg', 'touch'] },
  },
}

export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = {}
export const Invalido: Story = { args: { invalid: true, defaultValue: '123' } }
export const Deshabilitado: Story = { args: { disabled: true, defaultValue: 'No editable' } }

export const TodosLosTamanos: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Input {...args} size="sm" placeholder="sm" />
      <Input {...args} size="md" placeholder="md" />
      <Input {...args} size="lg" placeholder="lg" />
      <Input {...args} size="touch" placeholder="touch" />
    </div>
  ),
}
