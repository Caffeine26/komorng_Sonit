import type { Config } from 'tailwindcss';
import { tokens } from './src/config/design-tokens';

// Tokens come from ./design-system/design_system.json via `pnpm build:tokens`.
// To change the brand, edit the JSON — never edit src/config/design-tokens.ts.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: tokens.colors,
      fontFamily: tokens.typography.fontFamily,
      fontSize: tokens.typography.fontSize,
      spacing: tokens.spacing,
      borderRadius: tokens.radius,
    },
  },
  plugins: [],
} satisfies Config;
