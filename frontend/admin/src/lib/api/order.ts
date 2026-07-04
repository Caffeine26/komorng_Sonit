import { apiFetch } from './client'

const withTenant = (slug?: string): Record<string, string> =>
  slug ? { 'x-tenant-slug': slug } : {}

export interface AdminCartItem {
  menuItemId: string
  itemName: string
  quantity: number
  unitPriceCents: number
  variantSnapshot?: unknown
  optionsSnapshot?: unknown
  notes?: string
}

export async function createAdminSession(
  tenantSlug?: string,
  tableId?: string,
  token?: string
): Promise<{ sessionId: string }> {
  return apiFetch<{ sessionId: string }>(
    '/api/v1/admin/sessions',
    {
      method: 'POST',
      body: { tableId },
      headers: withTenant(tenantSlug),
      token,
    }
  )
}

export async function submitAdminOrder(
  data: {
    sessionId?: string
    tableId?: string
    items: AdminCartItem[]
    notes?: string
    locale?: string
  },
  tenantSlug?: string,
  token?: string
): Promise<{
  orderId: string
  orderNumber: string
  totalCents: number
}> {
  return apiFetch<{
    orderId: string
    orderNumber: string
    totalCents: number
  }>(
    '/api/v1/admin/orders',
    {
      method: 'POST',
      body: data,
      headers: withTenant(tenantSlug),
      token,
    }
  )
}

export async function getAdminOrdersList(
  tenantSlug?: string,
  token?: string,
  customerId?: string
): Promise<any[]> {
  const url = customerId 
    ? `/api/v1/admin/orders?customerId=${customerId}`
    : '/api/v1/admin/orders';
    
  return apiFetch<any[]>(
    url,
    {
      headers: withTenant(tenantSlug),
      token,
    }
  )
}

export async function acknowledgeAdminOrderNewItems(
  orderId: string,
  tenantSlug?: string,
  token?: string,
): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(
    `/api/v1/admin/orders/${orderId}/acknowledge-new-items`,
    {
      method: 'POST',
      headers: withTenant(tenantSlug),
      token,
    },
  )
}

export async function patchAdminOrderStatus(
  orderId: string,
  data: {
    status: string
    cancellationReason?: string
  },
  tenantSlug?: string,
  token?: string
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/admin/orders/${orderId}/status`,
    {
      method: 'PATCH',
      body: data,
      headers: withTenant(tenantSlug),
      token,
    }
  )
}