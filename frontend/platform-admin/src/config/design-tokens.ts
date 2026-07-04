// ============================================================================
// GENERATED — do not edit by hand.
// Source:     design-system/design_system.json  (XFOS Platform Admin v0.1.0)
// Regenerate: pnpm build:tokens
// ============================================================================

export const tokens = {
  "colors": {
    "brand": {
      "DEFAULT": "#374151",
      "foreground": "#ffffff",
      "muted": "#E5E7EB"
    },
    "background": "#F3F4F6",
    "foreground": "#111827",
    "muted": "#6B7280",
    "border": "#D1D5DB",
    "success": "#059669",
    "warning": "#D97706",
    "danger": "#B91C1C"
  },
  "spacing": {
    "xs": "0.25rem",
    "sm": "0.5rem",
    "md": "1rem",
    "lg": "1.5rem",
    "xl": "2rem",
    "2xl": "3rem"
  },
  "typography": {
    "fontFamily": {
      "sans": [
        "ui-monospace",
        "SFMono-Regular",
        "monospace"
      ],
      "display": [
        "system-ui",
        "-apple-system",
        "sans-serif"
      ]
    },
    "fontSize": {
      "xs": "0.75rem",
      "sm": "0.875rem",
      "base": "1rem",
      "lg": "1.125rem",
      "xl": "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem"
    }
  },
  "radius": {
    "none": "0",
    "sm": "0.25rem",
    "md": "0.375rem",
    "lg": "0.5rem",
    "full": "9999px"
  }
} as const;

export type Tokens = typeof tokens;
