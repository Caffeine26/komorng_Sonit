import { z } from 'zod';

export const RegisterTenantSchema = z.object({
  storeNameEn: z.string().min(2, 'Shop name (English) must be at least 2 characters'),
  storeNameKm: z.string().min(2, 'Shop name (Khmer) must be at least 2 characters'),
  slug: z.string().min(2, 'URL slug must be at least 2 characters'),
  description: z.string().optional(),
});
export type RegisterTenantRequest = z.infer<typeof RegisterTenantSchema>;

export const RegisterTenantResponseSchema = z.object({
  success: z.boolean(),
  tenantId: z.string().optional(),
  message: z.string().optional(),
});
export type RegisterTenantResponse = z.infer<typeof RegisterTenantResponseSchema>;

export const ProvisionTenantSchema = z.object({
  slug: z.string().min(2),
  name: z.string().min(2),
  ownerEmail: z.string().email(),
});
export type ProvisionTenantInput = z.infer<typeof ProvisionTenantSchema>;

export const SetupProgressSchema = z.object({
  tenantId: z.string(),
  completedSteps: z.array(z.string()),
  totalSteps: z.number().int().positive(),
});
export type SetupProgress = z.infer<typeof SetupProgressSchema>;
