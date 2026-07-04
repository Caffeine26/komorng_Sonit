import { z } from 'zod';
import { OrderCancellationReasonEnum } from '@xfos/contracts-enums';

export const updateOrderStatusInputSchema = z.object({
  status: z.enum(['PREPARING', 'READY', 'COMPLETED', 'CANCELLED']),
  cancellationReason: OrderCancellationReasonEnum.optional(),
  reason: z.string().optional(),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusInputSchema>;
