import {
  type AdminMenuOverviewResponse,
  type AdminCreateCategoryInput,
  type AdminUpdateCategoryInput,
  type AdminCategoryResponse,
  type AdminCreateMenuItemInput,
  type AdminUpdateMenuItemInput,
  type AdminMenuItemResponse,
} from '@xfos/contracts-bff-admin';
import { apiFetch } from './client';

const withTenant = (slug?: string): Record<string, string> => {
  if (!slug) return {};
  return { 'x-tenant-slug': String(slug) };
};

// ── Dashboard / Overview ──────────────────────────────────────────────────────
export async function getAdminMenuOverview(tenantSlug?: string, token?: string): Promise<AdminMenuOverviewResponse> {
  return apiFetch<AdminMenuOverviewResponse>('/api/v1/admin/menu', {
    headers: withTenant(tenantSlug),
    token
  });
}

// ── Categories ───────────────────────────────────────────────────────────────
export async function getAdminCategories(tenantSlug?: string, token?: string): Promise<AdminCategoryResponse[]> {
  return apiFetch<AdminCategoryResponse[]>('/api/v1/admin/menu/categories', {
    headers: withTenant(tenantSlug),
    token
  });
}

export async function createAdminCategory(data: AdminCreateCategoryInput, tenantSlug?: string, token?: string): Promise<AdminCategoryResponse> {
  return apiFetch<AdminCategoryResponse>('/api/v1/admin/menu/categories', {
    method: 'POST',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function updateAdminCategory(id: string, data: AdminUpdateCategoryInput, tenantSlug?: string, token?: string): Promise<AdminCategoryResponse> {
  return apiFetch<AdminCategoryResponse>(`/api/v1/admin/menu/categories/${id}`, {
    method: 'PUT',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function deleteAdminCategory(id: string, tenantSlug?: string, token?: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/v1/admin/menu/categories/${id}`, {
    method: 'DELETE',
    headers: withTenant(tenantSlug),
    token
  });
}

export async function reorderAdminCategories(
  items: { id: string; sortOrder: number }[],
  tenantSlug?: string,
  token?: string
): Promise<{ success: true }> {
  return apiFetch<{ success: true }>('/api/v1/admin/menu/categories/reorder', {
    method: 'POST',
    body: items,
    headers: withTenant(tenantSlug),
    token
  });
}

// ── Menu Items ────────────────────────────────────────────────────────────────
export async function getAdminMenuItems(categoryId: string, tenantSlug?: string, token?: string): Promise<AdminMenuItemResponse[]> {
  return apiFetch<AdminMenuItemResponse[]>(`/api/v1/admin/menu/categories/${categoryId}/items`, {
    headers: withTenant(tenantSlug),
    token
  });
}

export async function createAdminMenuItem(categoryId: string | 'any', data: AdminCreateMenuItemInput | any, tenantSlug?: string, token?: string): Promise<AdminMenuItemResponse> {
  // 'any' is used by global elements like in ElementFormModal
  const path = categoryId === 'any' ? '/api/v1/admin/menu/items' : `/api/v1/admin/menu/categories/${categoryId}/items`;
  return apiFetch<AdminMenuItemResponse>(path, {
    method: 'POST',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function getAdminMenuItemDetail(categoryId: string, id: string, tenantSlug?: string, token?: string): Promise<AdminMenuItemResponse> {
  return apiFetch<AdminMenuItemResponse>(`/api/v1/admin/menu/categories/${categoryId}/items/${id}`, {
    headers: withTenant(tenantSlug),
    token
  });
}

export async function updateAdminMenuItem(categoryId: string | 'any', id: string, data: AdminUpdateMenuItemInput | any, tenantSlug?: string, token?: string): Promise<AdminMenuItemResponse> {
  const path = categoryId === 'any' ? `/api/v1/admin/menu/items/${id}` : `/api/v1/admin/menu/categories/${categoryId}/items/${id}`;
  return apiFetch<AdminMenuItemResponse>(path, {
    method: 'PUT',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function deleteAdminMenuItem(categoryId: string, id: string, tenantSlug?: string, token?: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/v1/admin/menu/categories/${categoryId}/items/${id}`, {
    method: 'DELETE',
    headers: withTenant(tenantSlug),
    token
  });
}

export async function bulkDeleteAdminMenuItems(ids: string[], tenantSlug?: string, token?: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>('/api/v1/admin/menu/categories/all/items/bulk-delete', {
    method: 'POST',
    body: { ids },
    headers: withTenant(tenantSlug),
    token
  });
}

export async function reorderAdminMenuItems(
  categoryId: string,
  items: { id: string; sortOrder: number }[],
  tenantSlug?: string,
  token?: string
): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/v1/admin/menu/categories/${categoryId}/items/reorder`, {
    method: 'POST',
    body: items,
    headers: withTenant(tenantSlug),
    token
  });
}

// ── Image Upload ──────────────────────────────────────────────────────────────
export async function uploadMenuItemImage(file: File, tenantSlug: string, token?: string): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);

  return apiFetch<{ url: string }>('/api/v1/admin/menu/media/upload', {
    method: 'POST',
    body: formData,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function createAdminMenuItemImage(menuItemId: string, data: { imageUrl: string; isPrimary: boolean; sortOrder?: number }, tenantSlug?: string, token?: string): Promise<any> {
  return apiFetch<any>(`/api/v1/admin/menu/items/${menuItemId}/images`, {
    method: 'POST',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function updateAdminMenuItemImage(menuItemId: string, imageId: string, data: { isPrimary: boolean }, tenantSlug?: string, token?: string): Promise<any> {
  return apiFetch<any>(`/api/v1/admin/menu/items/${menuItemId}/images/${imageId}`, {
    method: 'PUT',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function deleteAdminMenuItemImage(menuItemId: string, imageId: string, tenantSlug?: string, token?: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/v1/admin/menu/items/${menuItemId}/images/${imageId}`, {
    method: 'DELETE',
    headers: withTenant(tenantSlug),
    token
  });
}

// Additional variants, option groups etc. can be added below as needed.

// ── Sizes & Variants ──────────────────────────────────────────────────────────

export async function createAdminMenuItemVariant(menuItemId: string, data: any, tenantSlug?: string, token?: string): Promise<any> {
  return apiFetch<any>(`/api/v1/admin/menu/items/${menuItemId}/variants`, {
    method: 'POST',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function updateAdminMenuItemVariant(menuItemId: string, variantId: string, data: any, tenantSlug?: string, token?: string): Promise<any> {
  return apiFetch<any>(`/api/v1/admin/menu/items/${menuItemId}/variants/${variantId}`, {
    method: 'PUT',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function deleteAdminMenuItemVariant(menuItemId: string, variantId: string, tenantSlug?: string, token?: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/v1/admin/menu/items/${menuItemId}/variants/${variantId}`, {
    method: 'DELETE',
    headers: withTenant(tenantSlug),
    token
  });
}

// ── Customization Groups ──────────────────────────────────────────────────────

export async function createAdminMenuItemOptionGroup(menuItemId: string, data: any, tenantSlug?: string, token?: string): Promise<any> {
  return apiFetch<any>(`/api/v1/admin/menu/items/${menuItemId}/option-groups`, {
    method: 'POST',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function updateAdminMenuItemOptionGroup(menuItemId: string, groupId: string, data: any, tenantSlug?: string, token?: string): Promise<any> {
  return apiFetch<any>(`/api/v1/admin/menu/items/${menuItemId}/option-groups/${groupId}`, {
    method: 'PUT',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function deleteAdminMenuItemOptionGroup(menuItemId: string, groupId: string, tenantSlug?: string, token?: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/v1/admin/menu/items/${menuItemId}/option-groups/${groupId}`, {
    method: 'DELETE',
    headers: withTenant(tenantSlug),
    token
  });
}

// ── Customization Choice Options ──────────────────────────────────────────────

export async function createAdminMenuItemOption(menuItemId: string, groupId: string, data: any, tenantSlug?: string, token?: string): Promise<any> {
  return apiFetch<any>(`/api/v1/admin/menu/items/${menuItemId}/option-groups/${groupId}/options`, {
    method: 'POST',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function updateAdminMenuItemOption(menuItemId: string, groupId: string, optionId: string, data: any, tenantSlug?: string, token?: string): Promise<any> {
  return apiFetch<any>(`/api/v1/admin/menu/items/${menuItemId}/option-groups/${groupId}/options/${optionId}`, {
    method: 'PUT',
    body: data,
    headers: withTenant(tenantSlug),
    token
  });
}

export async function deleteAdminMenuItemOption(menuItemId: string, groupId: string, optionId: string, tenantSlug?: string, token?: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/v1/admin/menu/items/${menuItemId}/option-groups/${groupId}/options/${optionId}`, {
    method: 'DELETE',
    headers: withTenant(tenantSlug),
    token
  });
}

export { uploadMenuItemImage as uploadAdminMenuItemImageFile };
