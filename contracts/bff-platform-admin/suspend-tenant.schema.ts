import { z } from 'zod';

// POST /api/v1/platform-admin/tenants/:id/suspend
//
// Internal-ops action. The BFF use case calls the tenant domain's
// SuspendTenantUseCase which enforces the invariants (already-suspended
// tenants can't be suspended again, billing is paused, audit log entry
// is written).

export const SuspendTenantRequestSchema = z.object({
  reason: z.string().min(1),
  // Optional flag — if true, kitchen is notified (in case there's an
  // active service in progress and the suspension should be deferred).
  deferIfActiveService: z.boolean().default(false),
});
export type SuspendTenantRequest = z.infer<typeof SuspendTenantRequestSchema>;

export const SuspendTenantResponseSchema = z.object({
  tenantId: z.string(),
  status: z.literal('SUSPENDED'),
  suspendedAt: z.string().datetime(),
  reason: z.string(),
});
export type SuspendTenantResponse = z.infer<typeof SuspendTenantResponseSchema>;
