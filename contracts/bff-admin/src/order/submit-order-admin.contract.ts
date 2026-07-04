import { z } from 'zod';

export const submitOrderAdminInputSchema = z.object({
  sessionId: z.string().optional(),
  tableId: z.string().optional(),
  items: z.array(
    z.object({
      menuItemId: z.string(),
      itemName: z.string(),
      quantity: z.number().int().min(1),
      unitPriceCents: z.number().int().min(0),
      variantSnapshot: z.union([
        z.record(z.unknown()),
        z.array(z.unknown()),
      ]).optional().nullable(),
      optionsSnapshot: z.union([
        z.record(z.unknown()),
        z.array(z.unknown()),
      ]).optional().nullable(),
      notes: z.string().optional(),
    })
  ).min(1),
  notes: z.string().optional(),
  locale: z.enum(['en', 'km']).optional(),
});

export type SubmitOrderAdminInput = z.infer<typeof submitOrderAdminInputSchema>;

export const submitOrderAdminOutputSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: z.literal('SUBMITTED'),
  totalCents: z.number().int(),
  createdAt: z.string().datetime(),
});

export type SubmitOrderAdminOutput = z.infer<typeof submitOrderAdminOutputSchema>;
