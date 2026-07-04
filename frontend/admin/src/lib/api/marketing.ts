import { apiFetch } from './client';
import {
  GetNotificationTemplatesResponseDto,
  CreateNotificationTemplateRequestDto,
  UpdateNotificationTemplateRequestDto,
  SendCrmBroadcastRequestDto,
  SendCrmBroadcastResponseDto,
  NotificationTemplateDto
} from '@xfos/contracts-bff-admin';

export const getMarketingTemplates = async (tenantSlug: string): Promise<NotificationTemplateDto[]> => {
  const data = await apiFetch<GetNotificationTemplatesResponseDto>(`/api/v1/admin/${tenantSlug}/marketing/templates`, {
    headers: {
      'x-tenant-slug': tenantSlug,
    },
  });
  return data.templates;
};

export const createMarketingTemplate = async (
  tenantSlug: string,
  data: CreateNotificationTemplateRequestDto
): Promise<NotificationTemplateDto> => {
  return await apiFetch<NotificationTemplateDto>(`/api/v1/admin/${tenantSlug}/marketing/templates`, {
    method: 'POST',
    headers: {
      'x-tenant-slug': tenantSlug,
    },
    body: data,
  });
};

export const updateMarketingTemplate = async (
  tenantSlug: string,
  id: string,
  data: UpdateNotificationTemplateRequestDto
): Promise<NotificationTemplateDto> => {
  return await apiFetch<NotificationTemplateDto>(`/api/v1/admin/${tenantSlug}/marketing/templates/${id}`, {
    method: 'PATCH',
    headers: {
      'x-tenant-slug': tenantSlug,
    },
    body: data,
  });
};

export const deleteMarketingTemplate = async (
  tenantSlug: string,
  id: string
): Promise<void> => {
  await apiFetch(`/api/v1/admin/${tenantSlug}/marketing/templates/${id}`, {
    method: 'DELETE',
    headers: {
      'x-tenant-slug': tenantSlug,
    },
  });
};

export const sendCrmBroadcast = async (
  tenantSlug: string,
  data: SendCrmBroadcastRequestDto
): Promise<SendCrmBroadcastResponseDto> => {
  return await apiFetch<SendCrmBroadcastResponseDto>(`/api/v1/admin/${tenantSlug}/marketing/broadcasts/send`, {
    method: 'POST',
    headers: {
      'x-tenant-slug': tenantSlug,
    },
    body: data,
  });
};
