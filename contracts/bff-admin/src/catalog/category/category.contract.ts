import { z } from 'zod';
import { CategorySchema, CreateCategoryRequestSchema, UpdateCategoryRequestSchema } from '@xfos/contracts-catalog';

export const AdminCreateCategorySchema = CreateCategoryRequestSchema;
export type AdminCreateCategoryInput = z.infer<typeof AdminCreateCategorySchema>;

export const AdminUpdateCategorySchema = UpdateCategoryRequestSchema;
export type AdminUpdateCategoryInput = z.infer<typeof AdminUpdateCategorySchema>;

export const AdminCategoryResponseSchema = CategorySchema.extend({
  id: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type AdminCategoryResponse = z.infer<typeof AdminCategoryResponseSchema>;

export const AdminReorderCategorySchema = z.array(z.object({
  id: z.string(),
  sortOrder: z.number().int(),
}));
export type AdminReorderCategoryRequest = z.infer<typeof AdminReorderCategorySchema>;
