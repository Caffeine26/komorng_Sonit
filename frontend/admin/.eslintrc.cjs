/** @type {import('eslint').Linter.Config} */
// Frontend app boundaries — see docs/mvp/folder_structure_and_decision.md §12.
//
// Three rules in priority order:
//   1. Self-contained app:    cannot import from sibling frontend/* or backend/*
//   2. Feature isolation:     features/<A> cannot reach into features/<B>'s internals
//   3. lib/ is one-way:       lib/ cannot import from features/
module.exports = {
  root: false,
  extends: ['next/core-web-vitals'],
  rules: {
    // TypeScript handles these better than ESLint's JS-only versions.
    'no-undef': 'off',
    'no-unused-vars': 'off',
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            // Rule 1 — app isolation
            group: ['**/frontend/**', '**/backend/**'],
            message:
              'Each frontend app is self-contained. Only import from `@xfos/contracts-bff-admin` and `@xfos/contracts-enums`.',
          },
          {
            // Rule 2 — feature isolation: import features only via their public index
            group: ['@/features/*/*'],
            message:
              'Cross-feature imports must go through @/features/<name> (its index.ts public API).',
          },
          {
            // Rule 4 — BFF-only contracts. See ADR-008.
            group: [
              '@xfos/contracts-order',
              '@xfos/contracts-catalog',
              '@xfos/contracts-billing',
              '@xfos/contracts-tenant',
              '@xfos/contracts-kitchen',
              '@xfos/contracts-auth',
              '@xfos/contracts-onboarding',
              '@xfos/contracts-bff-storefront',
              '@xfos/contracts-bff-kitchen',
              '@xfos/contracts-bff-platform-admin',
            ],
            message:
              'Frontend apps cannot import domain contracts or sibling BFF contracts. Use @xfos/contracts-bff-admin.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // Rule 3 — lib/ may not depend on features/
      files: ['src/lib/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/features/*', '@/features'],
                message:
                  'lib/ is a one-way dependency — it cannot import from features/. Move shared code into lib/ or invert the dependency.',
              },
            ],
          },
        ],
      },
    },
  ],
};
