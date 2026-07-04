import { z } from 'zod';

export const NotificationTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  body: z.string(),
  icon: z.string().nullable().optional(),
  buttonText: z.string().nullable().optional(),
  actionUrl: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type NotificationTemplateDto = z.infer<typeof NotificationTemplateSchema>;

export const CreateNotificationTemplateRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  icon: z.string().nullable().optional(),
  buttonText: z.string().nullable().optional(),
  actionUrl: z.string().nullable().optional(),
});

export type CreateNotificationTemplateRequestDto = z.infer<typeof CreateNotificationTemplateRequestSchema>;

export const UpdateNotificationTemplateRequestSchema = CreateNotificationTemplateRequestSchema.partial();

export type UpdateNotificationTemplateRequestDto = z.infer<typeof UpdateNotificationTemplateRequestSchema>;

export const GetNotificationTemplatesResponseSchema = z.object({
  templates: z.array(NotificationTemplateSchema),
});

export type GetNotificationTemplatesResponseDto = z.infer<typeof GetNotificationTemplatesResponseSchema>;

export const SendCrmBroadcastRequestSchema = z.object({
  templateId: z.string(),
  customerIds: z.array(z.string()).min(1, 'Select at least one customer'),
});

export type SendCrmBroadcastRequestDto = z.infer<typeof SendCrmBroadcastRequestSchema>;

export const SendCrmBroadcastResponseSchema = z.object({
  success: z.boolean(),
  sentCount: z.number(),
});

export type SendCrmBroadcastResponseDto = z.infer<typeof SendCrmBroadcastResponseSchema>;

export const MarketingChartDataPointSchema = z.object({
  date: z.string(),
  sent: z.number(),
  opened: z.number(),
  clicked: z.number(),
});

export type MarketingChartDataPointDto = z.infer<typeof MarketingChartDataPointSchema>;

export const MarketingInsightsResponseSchema = z.object({
  totalSent: z.number(),
  totalOpened: z.number(),
  totalClicked: z.number(),
  openRate: z.number(),
  clickRate: z.number(),
  chartData: z.array(MarketingChartDataPointSchema),
});

export type MarketingInsightsResponseDto = z.infer<typeof MarketingInsightsResponseSchema>;
