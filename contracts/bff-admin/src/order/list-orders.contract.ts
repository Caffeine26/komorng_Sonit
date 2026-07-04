import { z } from 'zod';
import { OrderStatusEnum, OrderSourceEnum, ServiceModelEnum } from '@xfos/contracts-enums';

export const listOrdersItemSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: OrderStatusEnum,
  tableRef: z.string().nullable(),
  tableId: z.string().nullable().optional(),
  tableImage: z.string().nullable().optional(),
  totalCents: z.number().int(),
  itemCount: z.number().int(),
  source: OrderSourceEnum,
  serviceModel: ServiceModelEnum.optional(),
  createdAt: z.string().datetime(),
  submittedAt: z.string().datetime().nullable(),
  items: z.array(z.object({
    id: z.string().optional(),
    itemName: z.string(),
    quantity: z.number().int(),
    unitPriceCents: z.number().int(),
    variantSnapshot: z.union([z.record(z.unknown()), z.null()]).optional(),
    optionsSnapshot: z.union([z.array(z.unknown()), z.null()]).optional(),
    notes: z.string().nullable().optional(),
    isNew: z.boolean().optional(),
    isNewlyAdded: z.boolean().optional(),
    itemStatus: OrderStatusEnum.optional(),
  })).optional(),
  needsAttention: z.boolean().optional(),
  customerName: z.string().nullable().optional(),
  orderToken: z.string(),
});

export type ListOrdersItem = z.infer<typeof listOrdersItemSchema>;

export const listOrdersOutputSchema = z.array(listOrdersItemSchema);

export type ListOrdersOutput = z.infer<typeof listOrdersOutputSchema>;
