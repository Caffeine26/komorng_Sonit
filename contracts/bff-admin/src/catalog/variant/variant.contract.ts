import { z } from 'zod';
import { MenuItemVariantSchema } from '@xfos/contracts-catalog';

export const AdminCreateMenuItemVariantSchema = MenuItemVariantSchema.omit({ id: true });
export type AdminCreateMenuItemVariantInput = z.infer<typeof AdminCreateMenuItemVariantSchema>;

export const AdminUpdateMenuItemVariantSchema = MenuItemVariantSchema.partial().extend({ id: z.string() });
export type AdminUpdateMenuItemVariantInput = z.infer<typeof AdminUpdateMenuItemVariantSchema>;

export const AdminMenuItemVariantResponseSchema = MenuItemVariantSchema.extend({
  id: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type AdminMenuItemVariantResponse = z.infer<typeof AdminMenuItemVariantResponseSchema>;
