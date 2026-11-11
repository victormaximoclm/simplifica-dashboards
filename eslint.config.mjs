import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier'

// O eslint-config-next 16 já registra o plugin "import". O flat config não aceita o mesmo nome de plugin
// apontando para outra instância, então reaproveitamos a instância dele para as regras de import abaixo.
const importPlugin = nextVitals.find(config => config.plugins?.import)?.plugins.import
const reactHooksPlugin = nextVitals.find(config => config.plugins?.['react-hooks'])?.plugins['react-hooks']

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    '.next/**',
    'storage/**',
    'pgdata/**',
    'coverage/**',
    'next-env.d.ts',
    'src/assets/iconify-icons/generated-icons.css',

    // Pasta temporária criada pelo tsx (socket de IPC); não é código do projeto
    'tsx-*/**'
  ]),

  ...nextVitals,

  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    plugins: { import: importPlugin, 'react-hooks': reactHooksPlugin },
    rules: {
      // Equivalente ao antigo "plugin:import/recommended" (sem import/no-named-as-default, desligada abaixo)
      ...importPlugin.flatConfigs.recommended.rules,

      // Regras novas do react-hooks 7 (React Compiler) que o código atual viola: ficam como aviso até serem
      // corrigidas (lista em docs/CODEBASE_MAP.md, "Pendências de lint")
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',

      'jsx-a11y/alt-text': 'off',
      'react/display-name': 'off',
      'react/no-children-prop': 'off',
      '@next/next/no-img-element': 'off',
      '@next/next/no-page-custom-font': 'off',
      'import/no-named-as-default': 'off',
      'lines-around-comment': [
        'error',
        {
          beforeBlockComment: true,
          beforeLineComment: true,
          allowBlockStart: true,
          allowObjectStart: true,
          allowArrayStart: true
        }
      ],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'any', prev: 'export', next: 'export' },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
        { blankLine: 'always', prev: '*', next: ['function', 'multiline-const', 'multiline-block-like'] },
        { blankLine: 'always', prev: ['function', 'multiline-const', 'multiline-block-like'], next: '*' }
      ],
      'newline-before-return': 'error',
      'import/newline-after-import': ['error', { count: 1 }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', ['internal', 'parent', 'sibling', 'index'], ['object', 'unknown']],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: 'next/**', group: 'external', position: 'before' },
            { pattern: '~/**', group: 'external', position: 'before' },
            { pattern: '@/**', group: 'internal' }
          ],
          pathGroupsExcludedImportTypes: ['react', 'type'],
          'newlines-between': 'always-and-inside-groups'
        }
      ]
    },
    settings: {
      react: { version: 'detect' },
      'import/parsers': {},
      'import/resolver': {
        node: {},
        typescript: { project: './jsconfig.json' }
      }
    }
  },

  // Por último: desliga regras de formatação que conflitam com o Prettier
  prettier
])
