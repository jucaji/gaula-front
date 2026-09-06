import { getMockSession, type Session } from './session'

/** Ver el comentario de "INSUMO PENDIENTE" en session.ts -- este hook es la única puerta de entrada. */
export function useSession(): Session {
  return getMockSession()
}
