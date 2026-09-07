import { useEffect, useState } from 'react'

/**
 * ECharts/MapLibre pintan en canvas/WebGL -- no leen `[data-theme]` como CSS.
 * Este hook es la ÚNICA fuente de "qué tema está activo ahora mismo" para
 * ese tipo de componente: observa el atributo (tema explícito) y, en su
 * ausencia, la preferencia del sistema (docs/06 §3.6, tres estados).
 */
function readResolvedTheme(): 'light' | 'dark' {
  const explicit = document.documentElement.getAttribute('data-theme')
  if (explicit === 'light' || explicit === 'dark') return explicit
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useResolvedTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readResolvedTheme())

  useEffect(() => {
    const update = () => setTheme(readResolvedTheme())

    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', update)

    return () => {
      observer.disconnect()
      media.removeEventListener('change', update)
    }
  }, [])

  return theme
}
