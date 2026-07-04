import { z } from 'zod';
import { MenuItemImageSchema } from '@xfos/contracts-catalog';

export const AdminCreateMenuItemImageSchema = MenuItemImageSchema.omit({ id: true });
export type AdminCreateMenuItemImageInput = z.infer<typeof AdminCreateMenuItemImageSchema>;

export const AdminUpdateMenuItemImageSchema = MenuItemImageSchema.partial().extend({ id: z.string() });
export type AdminUpdateMenuItemImageInput = z.infer<typeof AdminUpdateMenuItemImageSchema>;

export const AdminMenuItemImageResponseSchema = MenuItemImageSchema.extend({
  id: z.string(),
  createdAt: z.string().optional(),
});
export type AdminMenuItemImageResponse = z.infer<typeof AdminMenuItemImageResponseSchema>;
