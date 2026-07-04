import { z } from 'zod';

export const sendDirectMessageInputSchema = z.object({
  message: z.string().min(1).max(2000),
});

export type SendDirectMessageInput = z.infer<typeof sendDirectMessageInputSchema>;

export type SendDirectMessageOutput = void;
