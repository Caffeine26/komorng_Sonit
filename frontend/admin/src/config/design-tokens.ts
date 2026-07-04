// ============================================================================
// GENERATED — do not edit by hand.
// Source:     design-system/design_system.json  (XFOS Admin Super Clean v2.0)
// Regenerate: pnpm build:tokens
// ============================================================================

export const tokens = {
  "colors": {
    "brand": {
      "DEFAULT": "#E91E63",
      "foreground": "#ffffff",
      "muted": "#FFF0F5"
    },
    "primary": "#E91E63",
    "background": {
      "page": "#FFFFFF",
      "surface": "#FFFFFF",
      "alt": "var(--color-background-secondary)"
    },
    "foreground": "#09090b",
    "muted": "#71717a",
    "border": "#F3F4F6",
    "glass": {
      "light": "rgba(255, 255, 255, 0.55)",
      "medium": "rgba(255, 255, 255, 0.42)",
      "strong": "rgba(255, 255, 255, 0.72)",
      "dark": "rgba(9, 9, 11, 0.55)",
      "brand": "rgba(233, 30, 99, 0.12)",
      "brandMid": "rgba(233, 30, 99, 0.22)",
      "organic": "rgba(255, 250, 253, 0.72)"
    },
    "glassBorder": {
      "DEFAULT": "rgba(255, 255, 255, 0.32)",
      "dark": "rgba(255, 255, 255, 0.10)",
      "subtle": "rgba(255, 255, 255, 0.18)",
      "brand": "rgba(233, 30, 99, 0.20)"
    },
    "glassText": {
      "onDark": "rgba(255, 255, 255, 0.95)",
      "onDarkSub": "rgba(255, 255, 255, 0.60)",
      "onGlass": "rgba(9, 9, 11, 0.92)"
    },
    "gradient": {
      "pageWarm": "linear-gradient(160deg, #FFFFFF 0%, #FFF0F5 100%)",
      "glassFrost": "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 100%)",
      "darkScrim": "linear-gradient(180deg, transparent 40%, rgba(9,9,11,0.72) 100%)",
      "brandGlow": "radial-gradient(ellipse at 70% 80%, rgba(233,30,99,0.35) 0%, transparent 65%)",
      "brandOrb": "radial-gradient(ellipse, rgba(233,30,99,0.55) 0%, rgba(255,240,245,0.10) 65%)"
    },
    "feedback": {
      "success": "#34C759",
      "warning": "#FF9F0A",
      "destructive": "#FF3B30",
      "info": "#007AFF"
    }
  },
  "spacing": {
    "xs": "0.25rem",
    "sm": "0.5rem",
    "md": "1rem",
    "lg": "1.5rem",
    "xl": "2rem",
    "2xl": "2.5rem"
  },
  "typography": {
    "fontFamily": {
      "sans": [
        "var(--font-inter)",
        "Inter",
        "system-ui",
        "-apple-system",
        "sans-serif"
      ],
      "khmer": [
        "var(--font-kantumruy)",
        "Kantumruy Pro",
        "system-ui",
        "sans-serif"
      ]
    },
    "fontSize": {
      "tiny": "0.625rem",
      "xs": "0.75rem",
      "sm": "0.8125rem",
      "base": "0.875rem",
      "lg": "1rem",
      "xl": "1.125rem",
      "2xl": "1.25rem",
      "3xl": "1.5rem"
    }
  },
  "radius": {
    "none": "0",
    "sm": "0.5rem",
    "md": "0.75rem",
    "lg": "1rem",
    "xl": "1.25rem",
    "2xl": "1.5rem",
    "full": "9999px"
  }
} as const;

export type Tokens = typeof tokens;
