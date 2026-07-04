import { z } from 'zod';

// GET /api/v1/admin/menu
//
// Merchant-portal projection of the menu — every field a merchant edits.
// Shows cost, margin, availability state, and translation completeness.
// Customer-facing fields are a subset; internal fields are added here.

export const AdminMenuItemSchema = z.object({
  id: z.string(),
  name: z.object({
    en: z.string(),
    km: z.string(),
  }),
  description: z.object({
    en: z.string().nullable(),
    km: z.string().nullable(),
  }),
  priceCents: z.number().int().nonnegative(),
  costCents: z.number().int().nonnegative().nullable(),
  imageUrl: z.string().url().nullable(),
  available: z.boolean(),
  // Translation completeness — drives the merchant onboarding checklist
  translationComplete: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type AdminMenuItem = z.infer<typeof AdminMenuItemSchema>;

export const AdminMenuCategorySchema = z.object({
  id: z.string(),
  name: z.object({
    en: z.string(),
    km: z.string(),
  }),
  sortOrder: z.number().int().nonnegative(),
  items: z.array(AdminMenuItemSchema),
});
export type AdminMenuCategory = z.infer<typeof AdminMenuCategorySchema>;

export const AdminMenuOverviewResponseSchema = z.object({
  categories: z.array(AdminMenuCategorySchema),
  totalItems: z.number().int().nonnegative(),
  totalAvailable: z.number().int().nonnegative(),
  // % of items with both en + km translations populated
  translationCompletenessPct: z.number().min(0).max(100),
});
export type AdminMenuOverviewResponse = z.infer<typeof AdminMenuOverviewResponseSchema>;
