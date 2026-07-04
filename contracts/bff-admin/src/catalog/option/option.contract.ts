import { z } from 'zod';
import { MenuItemOptionSchema } from '@xfos/contracts-catalog';

export const AdminCreateMenuItemOptionSchema = MenuItemOptionSchema.omit({ id: true });
export type AdminCreateMenuItemOptionInput = z.infer<typeof AdminCreateMenuItemOptionSchema>;

export const AdminUpdateMenuItemOptionSchema = MenuItemOptionSchema.partial().extend({ id: z.string() });
export type AdminUpdateMenuItemOptionInput = z.infer<typeof AdminUpdateMenuItemOptionSchema>;

export const AdminMenuItemOptionResponseSchema = MenuItemOptionSchema.extend({
  id: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type AdminMenuItemOptionResponse = z.infer<typeof AdminMenuItemOptionResponseSchema>;
