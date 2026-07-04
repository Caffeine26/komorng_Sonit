import { z } from 'zod';

// 1. Login Request
export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// 2. Login Response (What the frontend gets back)
export const authResponseSchema = z.object({
    accessToken: z.string(),
    user: z.object({
        id: z.string(),
        email: z.string(),
        role: z.string(),
        tenantId: z.string().nullable(), // Null for platform admins
    }),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

// 3. Refresh Token Request (Usually comes from a cookie, but we define it here)
export const refreshResponseSchema = z.object({
    accessToken: z.string(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
