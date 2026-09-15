import { describe, expect, it, vi } from 'vitest'
import { createBatchLoader } from './batchLoader'

describe('createBatchLoader', () => {
  it('junta en una petición lo que se pide a la vez y no repite claves', async () => {
    const fetchMany = vi.fn(async (keys: string[]) => new Map(keys.map((key) => [key, `nombre de ${key}`])))
    const loader = createBatchLoader(fetchMany)

    const results = await Promise.all([loader.load('11001'), loader.load('25290'), loader.load('11001')])

    expect(results).toEqual(['nombre de 11001', 'nombre de 25290', 'nombre de 11001'])
    expect(fetchMany).toHaveBeenCalledTimes(1)
    expect(fetchMany).toHaveBeenCalledWith(['11001', '25290'])
  })

  it('lo que no se encuentra se resuelve en null', async () => {
    const loader = createBatchLoader(async () => new Map<string, string>())

    await expect(loader.load('99999')).resolves.toBeNull()
  })

  it('parte en lotes del tamaño máximo', async () => {
    const fetchMany = vi.fn(async (keys: number[]) => new Map(keys.map((key) => [key, key])))
    const loader = createBatchLoader(fetchMany, { maxBatch: 2 })

    await Promise.all([1, 2, 3, 4, 5].map((key) => loader.load(key)))

    expect(fetchMany.mock.calls.map(([keys]) => keys)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('un fallo rechaza a todos los que esperaban ese lote', async () => {
    const loader = createBatchLoader<string, string>(async () => {
      throw new Error('sin red')
    })

    const results = await Promise.allSettled([loader.load('a'), loader.load('b')])

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected'])
  })

  it('una petición posterior abre un lote nuevo', async () => {
    const fetchMany = vi.fn(async (keys: string[]) => new Map(keys.map((key) => [key, key])))
    const loader = createBatchLoader(fetchMany)

    await loader.load('a')
    await loader.load('b')

    expect(fetchMany).toHaveBeenCalledTimes(2)
  })
})
