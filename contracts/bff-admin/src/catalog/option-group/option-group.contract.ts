import { z } from 'zod';
import { MenuItemOptionGroupSchema } from '@xfos/contracts-catalog';

export const AdminCreateMenuItemOptionGroupSchema = MenuItemOptionGroupSchema.omit({ id: true, options: true });
export type AdminCreateMenuItemOptionGroupInput = z.infer<typeof AdminCreateMenuItemOptionGroupSchema>;

export const AdminUpdateMenuItemOptionGroupSchema = MenuItemOptionGroupSchema.omit({ options: true }).partial().extend({ id: z.string() });
export type AdminUpdateMenuItemOptionGroupInput = z.infer<typeof AdminUpdateMenuItemOptionGroupSchema>;

export const AdminMenuItemOptionGroupResponseSchema = MenuItemOptionGroupSchema.extend({
  id: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type AdminMenuItemOptionGroupResponse = z.infer<typeof AdminMenuItemOptionGroupResponseSchema>;
