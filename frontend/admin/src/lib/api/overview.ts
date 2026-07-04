import {
  type AdminMenuOverviewResponse,
  type AdminTodaySummaryResponse,
} from '@xfos/contracts-bff-admin'
import { apiFetch } from './client'

const withTenant = (slug?: string): Record<string, string> => {
  if (!slug) return {}
  return { 'x-tenant-slug': String(slug) }
}

export async function getAdminMenuOverview(
  tenantSlug?: string,
  token?: string
): Promise<AdminMenuOverviewResponse> {
  return apiFetch<AdminMenuOverviewResponse>(
    '/api/v1/admin/menu',
    { headers: withTenant(tenantSlug),
      token }
  )
}

export async function getAdminTodaySummary(
  tenantSlug?: string,
  token?: string
): Promise<AdminTodaySummaryResponse> {
  return apiFetch<AdminTodaySummaryResponse>(
    '/api/v1/admin/dashboard/today',
    { headers: withTenant(tenantSlug),
      token }
  )
}
