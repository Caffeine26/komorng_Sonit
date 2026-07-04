import { z } from 'zod';
import { ServiceModelEnum } from '@xfos/contracts-enums';

export const CreateTenantSchema = z.object({
  name: z.string().min(2),
  nameEn: z.string().min(2).optional(),
  nameKm: z.string().optional(),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  codePrefix: z.string().min(2).max(4).regex(/^[A-Z]+$/).optional(),
  serviceModel: ServiceModelEnum,
});

export type CreateTenantRequest = z.infer<typeof CreateTenantSchema>;

export const CreateTenantResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
});

export type CreateTenantResponse = z.infer<typeof CreateTenantResponseSchema>;
