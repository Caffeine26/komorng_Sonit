import { z } from 'zod';
import { ServiceModelEnum } from '@xfos/contracts-enums';

// -----------------------------------------------------------------------------
// List Tenants
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// Create Tenant
// -----------------------------------------------------------------------------
export const CreateTenantSchema = z.object({
  name: z.string().min(2),
  nameEn: z.string().min(2).optional(),
  nameKm: z.string().optional(),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  codePrefix: z.string().min(2).max(4).regex(/^[A-Z]+$/).optional(),
  serviceModel: ServiceModelEnum,
});
export type CreateTenantRequest = z.infer<typeof CreateTenantSchema>;

export const CreateTenantResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
});
export type CreateTenantResponse = z.infer<typeof CreateTenantResponseSchema>;

// -----------------------------------------------------------------------------
// Suspend Tenant
// -----------------------------------------------------------------------------
export const SuspendTenantRequestSchema = z.object({
  reason: z.string().min(1),
  deferIfActiveService: z.boolean().default(false),
});
export type SuspendTenantRequest = z.infer<typeof SuspendTenantRequestSchema>;

export const SuspendTenantResponseSchema = z.object({
  tenantId: z.string(),
  status: z.literal('SUSPENDED'),
  suspendedAt: z.string().datetime(),
  reason: z.string(),
});
export type SuspendTenantResponse = z.infer<typeof SuspendTenantResponseSchema>;
