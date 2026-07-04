import {
  type ListTenantsRequest,
  type ListTenantsResponse,
  type SuspendTenantRequest,
  type SuspendTenantResponse,
} from '@xfos/contracts-bff-platform-admin';
import { apiFetch } from './client';

// ──────────────────────────────────────────────────────────────────────────
// Platform-admin BFF client — the ONLY API surface this app talks to.
// Wraps /api/v1/platform-admin/* exposed by
// backend/api/src/modules/platform-admin/.
// ──────────────────────────────────────────────────────────────────────────

export async function listTenants(request: ListTenantsRequest): Promise<ListTenantsResponse> {
  return apiFetch<ListTenantsResponse>('/api/v1/platform-admin/tenants', {
    searchParams: {
      status: request.status,
      search: request.search,
      limit: request.limit,
      offset: request.offset,
    },
  });
}

export async function suspendTenant(
  tenantId: string,
  request: SuspendTenantRequest,
): Promise<SuspendTenantResponse> {
  return apiFetch<SuspendTenantResponse>(
    `/api/v1/platform-admin/tenants/${encodeURIComponent(tenantId)}/suspend`,
    { method: 'POST', body: request },
  );
}
