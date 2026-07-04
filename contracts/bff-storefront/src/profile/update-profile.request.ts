import { z } from 'zod';

export const updateStorefrontProfileRequestSchema = z.object({
  phoneNumber: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(), // expecting ISO string or simple YYYY-MM-DD
});

export type UpdateStorefrontProfileRequest = z.infer<typeof updateStorefrontProfileRequestSchema>;

export const getStorefrontProfileResponseSchema = z.object({
  phoneNumber: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
});

export type GetStorefrontProfileResponse = z.infer<typeof getStorefrontProfileResponseSchema>;
