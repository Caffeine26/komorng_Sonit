import { z } from 'zod';

// GET /api/v1/platform-admin/tenants
//
// Cross-tenant list — for internal ops only. Joins tenant + billing +
// last-activity into a single shape so the ops dashboard renders in one fetch.

export const PlatformAdminTenantStatusSchema = z.enum([
  'ACTIVE',
  'TRIAL',
  'SUSPENDED',
  'CANCELLED',
]);
export type PlatformAdminTenantStatus = z.infer<typeof PlatformAdminTenantStatusSchema>;

export const PlatformAdminTenantSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: PlatformAdminTenantStatusSchema,
  plan: z.string(),
  ordersLast30Days: z.number().int().nonnegative(),
  monthlyRevenueCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  lastActivityAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type PlatformAdminTenantSummary = z.infer<typeof PlatformAdminTenantSummarySchema>;

export const ListTenantsRequestSchema = z.object({
  status: PlatformAdminTenantStatusSchema.optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});
export type ListTenantsRequest = z.infer<typeof ListTenantsRequestSchema>;

export const ListTenantsResponseSchema = z.object({
  tenants: z.array(PlatformAdminTenantSummarySchema),
  total: z.number().int().nonnegative(),
});
export type ListTenantsResponse = z.infer<typeof ListTenantsResponseSchema>;
