import { z } from 'zod';
import { ServiceModelEnum, TenantStatusEnum } from '@xfos/contracts-enums';

export const TenantSettingsSchema = z.object({
  // Branding
  logoUrl: z.string().url().nullable().optional().or(z.literal('')).or(z.string().startsWith('data:image/')),
  coverImageUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i).default('#E07B39'),
  
  // Localization
  defaultLocale: z.enum(['km', 'en']).default('km'),
  currency: z.enum(['USD', 'KHR']).default('USD'),
  timezone: z.string().default('Asia/Phnom_Penh'),
  
  // Taxation
  taxRateBps: z.number().int().min(0).default(0),
  taxInclusive: z.boolean().default(true),
  
  // Operations
  autoAcceptOrders: z.boolean().default(true),
  paymentTiming: z.enum(['PAY_BEFORE', 'PAY_AFTER']).default('PAY_BEFORE'),
  
  // Contacts
  facebookUrl: z.string().optional(),
  phone: z.string().optional(),
  address: z.any().optional(),
  description: z.any().optional(),
  socialLinks: z.any().optional(),
});
export type TenantSettings = z.infer<typeof TenantSettingsSchema>;

export const TenantOperatingHourSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z.string(), // ISO time string
  closeTime: z.string(), // ISO time string
  isClosed: z.boolean(),
});
export type TenantOperatingHour = z.infer<typeof TenantOperatingHourSchema>;

export const TenantPaymentMethodSchema = z.object({
  id: z.string(),
  method: z.string(), // e.g. 'CASH', 'ABA_QR'
  provider: z.string().nullable(),
  isEnabled: z.boolean(),
  config: z.any().optional(),
});
export type TenantPaymentMethod = z.infer<typeof TenantPaymentMethodSchema>;

export const TenantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  nameEn: z.string(),
  nameKm: z.string().optional(),
  codePrefix: z.string(),
  status: TenantStatusEnum,
  serviceModel: ServiceModelEnum.optional(),
  settings: TenantSettingsSchema.optional(),
  operatingHours: z.array(TenantOperatingHourSchema).optional(),
  paymentMethods: z.array(TenantPaymentMethodSchema).optional(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const TenantContextResponseSchema = z.object({
  tenant: TenantSchema,
});
export type TenantContextResponse = z.infer<typeof TenantContextResponseSchema>;
