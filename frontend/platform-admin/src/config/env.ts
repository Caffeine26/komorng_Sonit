import { z } from 'zod';

// Validated at boot. Fails loudly with a clear error if env is wrong.
const schema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('XFOS Platform Admin'),
});

export const env = schema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
});
