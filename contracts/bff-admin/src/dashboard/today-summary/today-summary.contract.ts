import { z } from 'zod';

// GET /api/v1/admin/dashboard/today
//
// One-call dashboard. The BFF use case aggregates metrics from order,
// billing, and kitchen domains so the merchant portal renders in a single
// fetch instead of three.

export const AdminTodaySummaryResponseSchema = z.object({
  ordersToday: z.number().int().nonnegative(),
  revenueCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  averagePrepSeconds: z.number().int().nonnegative().nullable(),
  pendingTickets: z.number().int().nonnegative(),
  // Top 5 selling items today — for the dashboard widget
  topItems: z.array(
    z.object({
      menuItemId: z.string(),
      name: z.object({
        en: z.string(),
        km: z.string(),
      }),
      quantitySold: z.number().int().nonnegative(),
    }),
  ),
});
export type AdminTodaySummaryResponse = z.infer<typeof AdminTodaySummaryResponseSchema>;
