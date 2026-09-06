import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('dispara onClick en uso normal', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Guardar</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('con loading queda deshabilitado y marcado aria-busy -- no dispara onClick', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} loading>
        Guardar
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Guardar' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('asChild delega el render al hijo en vez de envolver en <button>', () => {
    render(
      <Button asChild>
        <a href="/casos">Ir a casos</a>
      </Button>,
    )

    const link = screen.getByRole('link', { name: 'Ir a casos' })
    expect(link).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
