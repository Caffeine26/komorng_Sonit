// ============================================================================
// GENERATED — do not edit by hand.
// Source:     design-system/design_system.json  (XFOS Liquid Glass Design System v1.0)
// Regenerate: pnpm build:tokens
// ============================================================================

export const tokens = {
  "colors": {
    "primary": "var(--primary)",
    "primary-hover": "var(--primary-hover)",
    "background": {
      "page": "var(--color-background)",
      "surface": "#FFFFFF"
    },
    "text": {
      "heading": "#18181B",
      "body": "#52525B",
      "muted": "#71717A",
      "inverse": "#FFFFFF"
    },
    "glass": {
      "light": "rgba(255, 255, 255, 0.65)",
      "medium": "rgba(255, 255, 255, 0.40)",
      "solid": "rgba(255, 255, 255, 0.80)"
    },
    "overlay": {
      "dim": "rgba(0, 0, 0, 0.25)",
      "light": "rgba(255, 255, 255, 0.10)"
    },
    "semantic": {
      "success": "#059669",
      "warning": "#D97706",
      "danger": "#DC2626"
    }
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px",
    "safe_area": "56px"
  },
  "typography": {
    "fontFamily": {
      "sans": [
        "Inter",
        "system-ui",
        "-apple-system",
        "sans-serif"
      ],
      "khmer": [
        "Noto Sans Khmer",
        "system-ui",
        "sans-serif"
      ]
    },
    "fontSize": {
      "xs": "11px",
      "sm": "12px",
      "md": "15px",
      "lg": "16px",
      "xl": "20px",
      "2xl": "24px",
      "3xl": "30px",
      "4xl": "36px"
    }
  },
  "radius": {
    "sm": "8px",
    "md": "12px",
    "lg": "16px",
    "xl": "24px",
    "pill": "9999px"
  }
} as const;

export type Tokens = typeof tokens;
