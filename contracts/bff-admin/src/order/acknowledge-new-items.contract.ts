import { z } from 'zod';
import { listOrdersItemSchema } from './list-orders.contract';

export const acknowledgeNewItemsOutputSchema = listOrdersItemSchema;

export type AcknowledgeNewItemsOutput = z.infer<typeof acknowledgeNewItemsOutputSchema>;
