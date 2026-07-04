import { z } from 'zod';

// Validated at boot. Fails loudly with a clear error if env is wrong.
const schema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('XFOS Storefront'),
  NEXT_PUBLIC_TELEGRAM_BOT_NAME: z.string().default('notification_kamangbot'),
  NEXT_PUBLIC_TELEGRAM_BOT_ID: z.string().default(''),
});

export const env = schema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_TELEGRAM_BOT_NAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME,
  NEXT_PUBLIC_TELEGRAM_BOT_ID: process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID,
});
