#!/usr/bin/env tsx
/**
 * Reads `design_system.json` (the source of truth for this app's visual
 * design) and regenerates `src/config/design-tokens.ts` with typed exports.
 *
 * Run from the app root:
 *   pnpm build:tokens
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ColorValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.record(ColorValueSchema)]),
);

const DesignSystemSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  colors: z.record(ColorValueSchema),
  spacing: z.record(z.string()),
  typography: z.object({
    fontFamily: z.record(z.array(z.string())),
    fontSize: z.record(z.string()),
  }),
  radius: z.record(z.string()),
});

const __filename = fileURLToPath(import.meta.url);
const appRoot = resolve(dirname(__filename), '..');
const jsonPath = resolve(appRoot, 'design-system/design_system.json');
const outPath = resolve(appRoot, 'src/config/design-tokens.ts');

const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
const parsed = DesignSystemSchema.parse(raw);

const tokensObject = {
  colors: parsed.colors,
  spacing: parsed.spacing,
  typography: parsed.typography,
  radius: parsed.radius,
};

const output = `// ============================================================================
// GENERATED — do not edit by hand.
// Source:     design-system/design_system.json  (${parsed.name} v${parsed.version})
// Regenerate: pnpm build:tokens
// ============================================================================

export const tokens = ${JSON.stringify(tokensObject, null, 2)} as const;

export type Tokens = typeof tokens;
`;

writeFileSync(outPath, output);
// eslint-disable-next-line no-console
console.log(`✓ ${parsed.name} v${parsed.version} → ${outPath.replace(appRoot + '/', '')}`);
