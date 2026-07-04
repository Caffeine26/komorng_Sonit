import { z } from 'zod';

// POST /api/v1/storefront/orders
//
// Customer-facing payload. The BFF use case orchestrates:
//   1. validate items against catalog (price + availability)
//   2. create the order entity (domains/order)
//   3. create the bill (domains/billing)
//   4. publish OrderSubmittedEvent (kitchen subscribes)
//   5. return order id + opaque token (for guest tracking — no account)

export const StorefrontSubmitOrderItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive(),
});
export type StorefrontSubmitOrderItem = z.infer<typeof StorefrontSubmitOrderItemSchema>;

export const StorefrontSubmitOrderRequestSchema = z.object({
  tenantSlug: z.string().min(1),
  items: z.array(StorefrontSubmitOrderItemSchema).min(1, 'Order must contain at least one item'),
  // Idempotency key — same key = same order id (BFF deduplicates)
  idempotencyKey: z.string().uuid().optional(),
  // Optional same-visit hint — frontend tracks this in localStorage
  sameVisitToken: z.string().nullable().optional(),
  locale: z.enum(['en', 'km']).optional(),
});
export type StorefrontSubmitOrderRequest = z.infer<typeof StorefrontSubmitOrderRequestSchema>;

export const StorefrontSubmitOrderResponseSchema = z.object({
  orderId: z.string(),
  token: z.string(), // opaque token used for guest order tracking
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  statusUrl: z.string(), // relative URL — /km/o/{token}
});
export type StorefrontSubmitOrderResponse = z.infer<typeof StorefrontSubmitOrderResponseSchema>;
