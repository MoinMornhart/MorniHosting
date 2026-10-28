import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The ts-patterns checks run in the editor tooling, not in ESLint. Registering their ids keeps
// `eslint-disable … ts-patterns/<rule>` comments valid for ESLint.
const TS_PATTERN_RULES = [
  'no-magic-numbers',
  'require-regex-example',
  'prefer-await-to-then',
  'no-loop-statements',
  'no-switch-statement',
  'no-param-reassign',
  'no-nested-ternary',
  'no-narrative-comment',
];
const tsPatterns = {
  rules: Object.fromEntries(
    TS_PATTERN_RULES.map((id) => [id, { meta: { type: 'suggestion', schema: [] }, create: () => ({}) }]),
  ),
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-demo/**',
      '**/node_modules/**',
      'apps/server/drizzle/**',
      'docs/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'ts-patterns': tsPatterns },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'off',
    },
  },
  {
    files: [
      'apps/server/**/*.ts',
      'packages/**/*.ts',
      'e2e/**/*.ts',
      '*.config.{js,ts}',
      'apps/web/scripts/**',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
