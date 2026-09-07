import { describe, expect, it } from 'vitest'
import { can } from './permissions'

describe('can', () => {
  it('permite el acceso cuando el usuario tiene alguno de los roles del recurso', () => {
    expect(can('READ', 'CASE_FILE', ['HOTLINE_OPERATOR'])).toBe(true)
  })

  it('niega el acceso cuando ninguno de los roles del usuario está en el recurso', () => {
    expect(can('READ', 'FLEET', ['HOTLINE_OPERATOR'])).toBe(false)
  })

  it('niega el acceso para un recurso que no existe en la tabla -- nunca permisivo por defecto', () => {
    expect(can('READ', 'RECURSO_INEXISTENTE', ['SYSTEM_ADMIN'])).toBe(false)
  })

  it('permite el acceso si CUALQUIERA de los roles del usuario alcanza, no todos', () => {
    expect(can('READ', 'ANALYTICS', ['HOTLINE_OPERATOR', 'PREVENTION_STAFF'])).toBe(true)
  })

  it('niega el acceso cuando el usuario no tiene roles', () => {
    expect(can('READ', 'CASE_FILE', [])).toBe(false)
  })
})
