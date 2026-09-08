import { LogOut } from 'lucide-react'
import { useRef } from 'react'

function readCsrfToken(): string {
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/**
 * Cerrar sesión.
 *
 * <p><strong>Es un formulario, no un `fetch`</strong>, y eso no es un detalle de
 * implementación: `POST /logout` responde con una redirección al
 * `end_session_endpoint` de Keycloak, y el NAVEGADOR tiene que seguirla para que
 * la sesión muera también allá (RP-initiated logout, docs/04 §2.5). Con `fetch`
 * la respuesta llega como `opaqueredirect`, el navegador no la sigue, y el
 * resultado es un **logout a medias**: se cierra la sesión local pero la de
 * Keycloak sobrevive y el siguiente login entra SIN pedir credenciales — lo
 * contrario de lo que espera quien pulsa "salir", y peligroso en un equipo
 * compartido por turnos.
 *
 * <p>HALLAZGO REAL (2026-09-08): el token CSRF se lee AL ENVIAR, no al pintar.
 * La primera versión lo leía durante el render y salía vacío, porque Spring
 * emite la cookie `XSRF-TOKEN` en su primera respuesta y el encabezado se pinta
 * antes de que llegue. El formulario quedaba sin `_csrf` y el logout habría
 * fallado con un 403 — un botón visible que no cierra la sesión es peor que no
 * tener botón.
 */
export function LogoutButton() {
  const csrfRef = useRef<HTMLInputElement>(null)

  return (
    <form
      method="post"
      action="/logout"
      onSubmit={() => {
        if (csrfRef.current) csrfRef.current.value = readCsrfToken()
      }}
    >
      <input ref={csrfRef} type="hidden" name="_csrf" defaultValue="" />
      <button
        type="submit"
        className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm text-text-secondary transition-colors duration-instant hover:bg-surface-sunken hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <LogOut size={16} strokeWidth={1.5} aria-hidden />
        Cerrar sesión
      </button>
    </form>
  )
}
