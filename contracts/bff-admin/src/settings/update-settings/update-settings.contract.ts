import { z } from 'zod';
import { 
  TenantSettingsSchema,
  TenantOperatingHourSchema,
  TenantPaymentMethodSchema
} from '@xfos/contracts-tenant';

/**
 * Handshake for updating Merchant settings.
 * We make every field optional (Partial) so the UI can send only what changed.
 */
export const UpdateTenantSettingsSchema = z.object({
  name: z.string().optional(),
  nameEn: z.string().optional(),
  nameKm: z.string().optional(),
  slug: z.string().optional(),
  codePrefix: z.string().optional(),
  serviceModel: z.string().optional(), // Use string to match the request type, validated in Use Case
  operatingHours: z.array(TenantOperatingHourSchema).optional(),
  paymentMethods: z.array(TenantPaymentMethodSchema).optional(),
}).merge(TenantSettingsSchema.partial());

export type UpdateTenantSettingsRequest = z.infer<typeof UpdateTenantSettingsSchema>;
