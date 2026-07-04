// Backend ESLint — per-layer boundaries for hexagonal discipline.
// - core/**      : no framework, no ORM, no transport, no sibling layers
// - application/**: uses ports (interfaces), no HTTP decorators, no infra imports
// - infra/**     : can touch Prisma/Redis/etc.; cannot import api/
// - api/**       : talks to use cases only; cannot import infra/ directly
module.exports = {
  root: false,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist/', 'node_modules/'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      files: ['src/domains/**/core/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@prisma/client', '@xfos/database'],
                message:
                  'core/ must be framework-free. Define a port and put the Prisma adapter in infra/.',
              },
              {
                group: ['@nestjs/*'],
                message:
                  'core/ must be framework-free. NestJS decorators belong in application/ or api/.',
              },
              {
                group: ['axios', 'node-fetch', 'got', 'undici', 'ioredis', 'bullmq', 'socket.io'],
                message: 'core/ cannot touch infrastructure. Define a port and put the adapter in infra/.',
              },
              {
                group: ['**/infra/**', '**/api/**', '**/application/**'],
                message: 'core/ cannot import from sibling layers. Dependency arrows point INWARD only.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/domains/**/application/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@prisma/client', '@xfos/database'],
                message:
                  'application/ uses ports, not Prisma directly. Inject the repository interface from core/ports.',
              },
              {
                group: ['**/infra/**', '**/api/**'],
                message: 'application/ cannot import infra/ or api/. Use injected ports.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/domains/**/infra/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/api/**'],
                message:
                  'infra/ cannot depend on api/. The arrow points api → application → core ← infra.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/domains/**/api/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/infra/**'],
                message: 'api/ talks to use cases, not infra directly. Use the use case from application/.',
              },
            ],
          },
        ],
      },
    },
  ],
};
