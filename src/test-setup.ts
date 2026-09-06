import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Sin `test.globals: true` (a propósito -- imports explícitos de vitest en
// cada archivo), el auto-cleanup de RTL no se activa solo: necesita
// `afterEach` como global, que aquí no existe. Sin esto, el DOM de cada
// test se queda montado y el siguiente test que busque por rol encuentra
// duplicados.
afterEach(cleanup)
