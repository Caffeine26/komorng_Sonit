import { z } from 'zod';

// -----------------------------------------------------------------------------
// Get Context (Landing Page)
// -----------------------------------------------------------------------------
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
  images: z.array(z.string().url()).optional(),
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
  name: z.object({
    en: z.string(),
    km: z.string().nullable().optional(),
  }),
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

// -----------------------------------------------------------------------------
// Submit Order (Checkout)
// -----------------------------------------------------------------------------
export const StorefrontSubmitOrderItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive(),
});
export type StorefrontSubmitOrderItem = z.infer<typeof StorefrontSubmitOrderItemSchema>;

export const StorefrontSubmitOrderRequestSchema = z.object({
  tenantSlug: z.string().min(1),
  items: z.array(StorefrontSubmitOrderItemSchema).min(1, 'Order must contain at least one item'),
  qrToken: z.string().min(1),
  sessionId: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid().optional(),
  locale: z.enum(['en', 'km']).optional(),
});
export type StorefrontSubmitOrderRequest = z.infer<typeof StorefrontSubmitOrderRequestSchema>;

export const StorefrontSubmitOrderResponseSchema = z.object({
  orderId: z.string(),
  token: z.string(), // opaque token used for guest order tracking
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  statusUrl: z.string(), // relative URL — /km/o/{token}
  sessionId: z.string().nullable(),
});
export type StorefrontSubmitOrderResponse = z.infer<typeof StorefrontSubmitOrderResponseSchema>;

// -----------------------------------------------------------------------------
// Order Status (Guest Tracking)
// -----------------------------------------------------------------------------
export const StorefrontOrderStatusItemSchema = z.object({
  menuItemId: z.string().optional(),
  name: z.object({
    en: z.string(),
    km: z.string(),
  }),
  quantity: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
  imageUrl: z.string().url().nullable().optional(),
  variantSnapshot: z.any().optional(),
  optionsSnapshot: z.any().optional(),
  notes: z.string().nullable().optional(),
});
export type StorefrontOrderStatusItem = z.infer<typeof StorefrontOrderStatusItemSchema>;

export const StorefrontOrderStatusResponseSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  token: z.string(),
  status: z.enum(['NEW', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']),
  items: z.array(StorefrontOrderStatusItemSchema),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  submittedAt: z.string().datetime().nullable().optional(),
  preparingAt: z.string().datetime().nullable().optional(),
  readyAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  version: z.number().int().optional(),
  customerName: z.string().nullable().optional(),
  tableRef: z.string().nullable(),
  tenant: z.object({
    name: z.string(),
    slug: z.string(),
    logoUrl: z.string().url().nullable(),
    codePrefix: z.string(),
  }),
});
export type StorefrontOrderStatusResponse = z.infer<typeof StorefrontOrderStatusResponseSchema>;

// -----------------------------------------------------------------------------
// Order History
// -----------------------------------------------------------------------------
export const StorefrontOrderHistoryItemSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  token: z.string(),
  status: z.enum(['NEW', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']),
  items: z.array(StorefrontOrderStatusItemSchema),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});
export type StorefrontOrderHistoryItem = z.infer<typeof StorefrontOrderHistoryItemSchema>;

export const StorefrontOrderHistoryResponseSchema = z.array(StorefrontOrderHistoryItemSchema);
export type StorefrontOrderHistoryResponse = z.infer<typeof StorefrontOrderHistoryResponseSchema>;
