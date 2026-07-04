import {
  type TableResponse,
  type CreateTableRequest,
  type UpdateTableRequest,
} from '@xfos/contracts-bff-admin';
import { apiFetch } from './client';

const withTenant = (slug?: string): Record<string, string> => {
  if (!slug) return {};
  return { 'x-tenant-slug': String(slug) };
};

// ── Table Management ──────────────────────────────────────────────────────────

export async function uploadAdminTableImage(file: File, tenantSlug?: string, token?: string): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<{ url: string }>('/api/v1/admin/menu/media/upload', {
    method: 'POST',
    body: formData,
    headers: withTenant(tenantSlug),
    token
  });
}

export type TableItem = TableResponse;

export async function getAdminTables(tenantSlug?: string, token?: string): Promise<TableItem[]> {
  return apiFetch<TableItem[]>('/api/v1/admin/tables', {
    headers: withTenant(tenantSlug),
    token
  });
}

export async function createAdminTable(data: CreateTableRequest, tenantSlug?: string, token?: string): Promise<TableItem> {
  return apiFetch<TableItem>('/api/v1/admin/tables', {
    method: 'POST',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function updateAdminTable(id: string, data: UpdateTableRequest, tenantSlug?: string, token?: string): Promise<TableItem> {
  return apiFetch<TableItem>(`/api/v1/admin/tables/${id}`, {
    method: 'PUT',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function deleteAdminTable(id: string, tenantSlug?: string, token?: string): Promise<{ success: true }> {
  await apiFetch<void>(`/api/v1/admin/tables/${id}`, {
    method: 'DELETE',
    headers: withTenant(tenantSlug),
    token
  });
  return { success: true };
}

export async function trackAdminTablePrint(id: string, tenantSlug?: string, token?: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/v1/admin/tables/${id}/qr/print`, {
    method: 'POST',
    headers: withTenant(tenantSlug),
    token
  });
}
