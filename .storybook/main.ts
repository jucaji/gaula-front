import type { StorybookConfig } from '@storybook/react-vite'
import { fileURLToPath, URL } from 'node:url'

// S0.FE.08: Storybook con Button/Input/Badge en 2 temas x 3 densidades.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (viteConfig) => {
    viteConfig.resolve ??= {}
    viteConfig.resolve.alias = {
      ...viteConfig.resolve.alias,
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    }
    return viteConfig
  },
}

export default config
