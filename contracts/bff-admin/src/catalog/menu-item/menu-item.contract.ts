import { z } from 'zod';
import { MenuItemSchema, CreateMenuItemRequestSchema, UpdateMenuItemRequestSchema } from '@xfos/contracts-catalog';

export const AdminCreateMenuItemSchema = CreateMenuItemRequestSchema;
export type AdminCreateMenuItemInput = z.infer<typeof AdminCreateMenuItemSchema>;

export const AdminUpdateMenuItemSchema = UpdateMenuItemRequestSchema;
export type AdminUpdateMenuItemInput = z.infer<typeof AdminUpdateMenuItemSchema>;

export const AdminMenuItemResponseSchema = MenuItemSchema.extend({
  id: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type AdminMenuItemResponse = z.infer<typeof AdminMenuItemResponseSchema>;

export const AdminReorderMenuItemSchema = z.array(z.object({
  id: z.string(),
  sortOrder: z.number().int(),
}));
export type AdminReorderMenuItemRequest = z.infer<typeof AdminReorderMenuItemSchema>;

export const AdminBulkDeleteItemsRequestSchema = z.object({
  ids: z.array(z.string()),
});
export type AdminBulkDeleteItemsRequest = z.infer<typeof AdminBulkDeleteItemsRequestSchema>;
