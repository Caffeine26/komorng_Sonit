import {
  type UpdateTenantSettingsRequest,
} from '@xfos/contracts-bff-admin'
import { type Tenant } from '@xfos/contracts-tenant'
import { apiFetch } from './client'

const withTenant = (slug?: string): Record<string, string> => {
  if (!slug) return {}
  return { 'x-tenant-slug': String(slug) }
}

export async function getAdminSettings(
  tenantSlug?: string,
  token?: string
): Promise<Tenant> {
  return apiFetch<Tenant>(
    '/api/v1/admin/settings',
    { headers: withTenant(tenantSlug),
      token }
  )
}

export async function updateAdminSettings(
  data: UpdateTenantSettingsRequest,
  tenantSlug?: string,
  token?: string
): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(
    '/api/v1/admin/settings',
    { method: 'PATCH', body: data,
      headers: withTenant(tenantSlug),
      token }
  )
}
