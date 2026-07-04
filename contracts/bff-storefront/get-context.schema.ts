import { z } from 'zod';

// GET /api/v1/storefront/context/:slug
//
// One call returns everything the storefront landing page needs:
// the tenant identity + the active menu. Tenant resolution + menu fetch
// happen inside the BFF use case (modules/storefront/application/), not
// across two HTTP round-trips.

export const StorefrontMenuItemSchema = z.object({
  id: z.string(),
  name: z.object({
    en: z.string(),
    km: z.string(),
  }),
  description: z
    .object({
      en: z.string().nullable(),
      km: z.string().nullable(),
    })
    .nullable(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  imageUrl: z.string().url().nullable(),
  available: z.boolean(),
  variants: z.array(z.any()).optional(),
  optionGroups: z.array(z.any()).optional(),
});
export type StorefrontMenuItem = z.infer<typeof StorefrontMenuItemSchema>;

export const StorefrontCategorySchema = z.object({
  id: z.string(),
  name: z.object({
    en: z.string(),
    km: z.string(),
  }),
  imageUrl: z.string().nullable().optional(),
  items: z.array(StorefrontMenuItemSchema),
});
export type StorefrontCategory = z.infer<typeof StorefrontCategorySchema>;

export const StorefrontTenantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().url().nullable(),
  currency: z.string().length(3),
  defaultLocale: z.enum(['en', 'km']),
  codePrefix: z.string(),
});
export type StorefrontTenant = z.infer<typeof StorefrontTenantSchema>;

export const StorefrontContextResponseSchema = z.object({
  tenant: StorefrontTenantSchema,
  menu: z.object({
    categories: z.array(StorefrontCategorySchema),
  }),
});
export type StorefrontContextResponse = z.infer<typeof StorefrontContextResponseSchema>;
