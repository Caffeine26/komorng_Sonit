import { z } from 'zod';

export const storefrontTelegramLoginRequestSchema = z.object({
  tenantSlug: z.string(),
  telegramData: z.object({
    id: z.union([z.string(), z.number()]),
    first_name: z.string(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    photo_url: z.string().url().optional(),
    auth_date: z.number(),
    hash: z.string(),
  }),
  sessionId: z.string().optional(),
});

export type StorefrontTelegramLoginRequest = z.infer<typeof storefrontTelegramLoginRequestSchema>;

export const storefrontTelegramLoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().email().nullable().optional(),
    fullName: z.string(),
    avatarUrl: z.string().url().nullable().optional(),
    tenantId: z.string(),
    tenantSlug: z.string(),
  }),
});

export type StorefrontTelegramLoginResponse = z.infer<typeof storefrontTelegramLoginResponseSchema>;
