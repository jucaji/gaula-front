import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'storybook-static', 'src/api/generated', 'src/routeTree.gen.ts', '.lighthouseci'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts', '.storybook/**/*.{ts,tsx}', '*.config.{ts,js,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // TanStack Router (file-based) exige exportar `Route` junto al
    // componente en el mismo archivo -- el fast refresh de un-solo-export
    // no aplica a esta convención.
    files: ['src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
