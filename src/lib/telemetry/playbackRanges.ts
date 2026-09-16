/** SPEC-0513: los atajos de rango del visor de recorrido. */
export const RANGOS = {
  hora: 'Última hora',
  hoy: 'Hoy',
  ayer: 'Ayer',
} as const

export type RangoId = keyof typeof RANGOS

/**
 * La pregunta operativa suele ser «hoy» o «ayer», no un rango escrito a mano.
 * Se calcula contra el reloj local: quien mira el recorrido piensa en su día,
 * no en UTC.
 */
export function rangoDe(id: RangoId, ahora = new Date()): { from: string; to: string } {
  const inicioDelDia = new Date(ahora)
  inicioDelDia.setHours(0, 0, 0, 0)
  if (id === 'hora') {
    return { from: new Date(ahora.getTime() - 3600_000).toISOString(), to: ahora.toISOString() }
  }
  if (id === 'hoy') {
    return { from: inicioDelDia.toISOString(), to: ahora.toISOString() }
  }
  const ayer = new Date(inicioDelDia.getTime() - 86_400_000)
  return { from: ayer.toISOString(), to: inicioDelDia.toISOString() }
}
