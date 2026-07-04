// Root ESLint config.
// - Per-layer rules for backend hexagonal architecture live at backend/domains/<domain>/.eslintrc.cjs
// - Per-app rules for each frontend live at frontend/<app>/.eslintrc.cjs
// - This root enforces cross-folder boundaries (frontend cannot import backend, etc.)
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended'],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    'coverage/',
    '.turbo/',
    '**/*.d.ts',
    'database/migrations/',
  ],
  rules: {
    // Enforce top-level folder boundaries via path patterns
    // (eslint-plugin-boundaries could be added later for richer checks)
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/backend/**'],
            message:
              'Frontend code cannot import from backend/. Use contracts/* (Zod schemas) for shared types.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // Backend is allowed to import from backend, contracts, database
      files: ['backend/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    {
      // Scripts and database are allowed anything
      files: ['scripts/**/*.ts', 'database/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
