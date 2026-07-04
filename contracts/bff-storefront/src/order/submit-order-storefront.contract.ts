import { z } from 'zod';

export const submitOrderStorefrontInputSchema = z.object({
  cartId: z.string(),
  sessionId: z.string(),
  tableRef: z.string().optional(),
  tableId: z.string().optional(),
  qrContextId: z.string().optional(),
  notes: z.string().optional(),
  locale: z.enum(['en', 'km']).optional(),
});

export type SubmitOrderStorefrontInput = z.infer<typeof submitOrderStorefrontInputSchema>;

export const submitOrderStorefrontOutputSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  orderToken: z.string(),
  status: z.enum(['SUBMITTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']),
  totalCents: z.number().int(),
  estimatedReadyAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

export type SubmitOrderStorefrontOutput = z.infer<typeof submitOrderStorefrontOutputSchema>;
