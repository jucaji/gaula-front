import type { Preview } from '@storybook/react-vite'
import { useEffect } from 'react'
import '../src/index.css'

// S0.FE.08: 2 temas x 3 densidades, elegibles desde la toolbar de Storybook.
// El tema reasigna `data-theme` en <html> (mismo mecanismo de docs/06 §3.6);
// la densidad envuelve la story en un contenedor con la altura de fila
// correspondiente, para juzgar el componente en el contexto real en que
// aparecerá (docs/06 §5) -- sin acoplar el tamaño del propio componente a
// la densidad, que sigue siendo un `size` explícito por historia.
const DENSITY_ROW_VAR = {
  compact: 'var(--density-compact-row)',
  default: 'var(--density-default-row)',
  comfortable: 'var(--density-comfortable-row)',
} as const

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: 'Tema',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Claro' },
          { value: 'dark', title: 'Oscuro' },
        ],
        dynamicTitle: true,
      },
    },
    density: {
      description: 'Densidad',
      toolbar: {
        icon: 'ruler',
        items: [
          { value: 'compact', title: 'Compacta (32px)' },
          { value: 'default', title: 'Default (36px)' },
          { value: 'comfortable', title: 'Cómoda (44px)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
    density: 'default',
  },
  decorators: [
    (Story, context) => {
      const theme = (context.globals.theme as 'light' | 'dark') ?? 'light'
      const density = (context.globals.density as keyof typeof DENSITY_ROW_VAR) ?? 'default'

      useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
      }, [theme])

      return (
        <div
          style={{
            minHeight: DENSITY_ROW_VAR[density],
            display: 'flex',
            alignItems: 'center',
            padding: '1rem',
            background: 'var(--color-canvas)',
          }}
        >
          <Story />
        </div>
      )
    },
  ],
}

export default preview
