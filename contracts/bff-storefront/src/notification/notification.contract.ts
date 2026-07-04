import { z } from 'zod';

export const TenantNotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  icon: z.string().nullable().optional(),
  actionUrl: z.string().nullable().optional(),
  isRead: z.boolean(),
  createdAt: z.string().datetime(),
});

export type TenantNotificationDto = z.infer<typeof TenantNotificationSchema>;

export const GetNotificationsResponseSchema = z.object({
  notifications: z.array(TenantNotificationSchema),
});

export type GetNotificationsResponseDto = z.infer<typeof GetNotificationsResponseSchema>;

export const MarkNotificationReadRequestSchema = z.object({});

export const MarkNotificationReadResponseSchema = z.object({
  success: z.boolean(),
});
