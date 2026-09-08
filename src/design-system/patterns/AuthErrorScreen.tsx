import { ShieldAlert } from 'lucide-react'
import { Button } from '@/design-system/primitives/Button'

/**
 * Pantalla de fallo de autenticación, DENTRO de la consola.
 *
 * <p>Antes esto era la página que Spring Security genera sola
 * ({@code :8080/login?error}): en inglés, con la estética del framework y un
 * enlace crudo al realm de Keycloak. Un usuario que ve eso no sabe si el
 * sistema se rompió, si escribió mal la contraseña o si entró donde no debía.
 *
 * <p>El texto evita afirmar "credenciales inválidas", porque la causa más común
 * NO es esa: es que la petición de autorización guardada en la sesión ya no
 * exista — el servidor se reinició, la sesión caducó, o la pestaña del login
 * estuvo abierta demasiado tiempo. Mandar a alguien a revisar una contraseña que
 * escribió bien es hacerle perder el tiempo en el lugar equivocado.
 */
export function AuthErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md rounded-sm border border-border-strong bg-surface p-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <ShieldAlert size={18} strokeWidth={1.5} className="text-alert" aria-hidden />
          No se pudo completar el inicio de sesión
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          El intento no llegó a término. Suele pasar cuando la pantalla de acceso estuvo abierta mucho tiempo o
          cuando el servidor se reinició mientras iniciaba sesión.
        </p>
        <p className="mt-2 text-2xs text-text-muted">
          Si vuelve a ocurrir después de reintentar, avise a soporte: puede no ser su contraseña.
        </p>
        <Button className="mt-4" variant="primary" size="md" onClick={onRetry}>
          Intentar de nuevo
        </Button>
      </div>
    </div>
  )
}
