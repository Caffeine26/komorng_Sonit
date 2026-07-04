import { z } from 'zod';

export const customerItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  fullName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isVip: z.boolean(),
  totalSpentCents: z.number(),
  totalOrders: z.number(),
  loyaltyPoints: z.number(),
  customerSegment: z.string().nullable(),
  lastVisitAt: z.string().nullable(),
  internalNotes: z.string().nullable(),
  telegramUsername: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type CustomerItem = z.infer<typeof customerItemSchema>;

export const listCustomersOutputSchema = z.array(customerItemSchema);

export type ListCustomersOutput = z.infer<typeof listCustomersOutputSchema>;
