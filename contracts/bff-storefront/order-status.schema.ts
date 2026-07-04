import { z } from 'zod';

// GET /api/v1/storefront/orders/:token
//
// Customer guest tracking. Authorization is the opaque token only — no
// account required. The token is unguessable and rotates per order.

export const StorefrontOrderStatusItemSchema = z.object({
  name: z.object({
    en: z.string(),
    km: z.string(),
  }),
  quantity: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
  imageUrl: z.string().url().nullable().optional(),
  menuItemId: z.string().optional(),
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
  tableRef: z.string().nullable(),
  customerName: z.string().nullable().optional(),
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
