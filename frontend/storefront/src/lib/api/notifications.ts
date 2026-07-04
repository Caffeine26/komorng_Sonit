import { GetNotificationsResponseDto } from '@xfos/contracts-bff-storefront';
import { apiFetch } from './client';

export async function getNotifications(tenantSlug: string): Promise<GetNotificationsResponseDto> {
  return apiFetch<GetNotificationsResponseDto>(`/api/v1/storefront/${tenantSlug}/notifications`);
}

export async function markNotificationRead(tenantSlug: string, id: string): Promise<void> {
  await apiFetch(`/api/v1/storefront/${tenantSlug}/notifications/${id}/read`, { method: 'PATCH' });
}
