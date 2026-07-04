import { z } from 'zod';
import { RoleEnum } from '@xfos/contracts-enums';

export const LoginSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const TelegramLoginSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
});
export type TelegramLoginInput = z.infer<typeof TelegramLoginSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().email().nullable().optional(),
    roles: z.array(z.string()),
    tenantId: z.string().nullable(),
    tenantStatus: z.string().nullable().optional(),
    tenantSlug: z.string().nullable().optional(),
  }),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;
