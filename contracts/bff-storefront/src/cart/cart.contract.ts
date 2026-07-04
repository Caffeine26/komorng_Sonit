import { z } from 'zod';

export const cartItemDtoSchema = z.object({
  id: z.string(),
  menuItemId: z.string(),
  quantity: z.number().int().min(1),
  unitPriceCents: z.number().int().min(0),
  lineTotalCents: z.number().int().min(0),
  variantSnapshot: z.unknown().nullable(),
  optionsSnapshot: z.unknown().nullable(),
  notes: z.string().nullable(),
});
export type CartItemDto = z.infer<typeof cartItemDtoSchema>;

export const getCartOutputSchema = z.object({
  cartId: z.string(),
  sessionId: z.string(),
  status: z.literal('ACTIVE'),
  items: z.array(cartItemDtoSchema),
  subtotalCents: z.number().int().min(0),
  itemCount: z.number().int().min(0),
});
export type GetCartOutput = z.infer<typeof getCartOutputSchema>;

export const addCartItemInputSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(1),
  unitPriceCents: z.number().int().min(0),
  variantId: z.string().optional().nullable(),
  optionIds: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
});
export type AddCartItemInput = z.infer<typeof addCartItemInputSchema>;

export const addCartItemOutputSchema = getCartOutputSchema;
export type AddCartItemOutput = z.infer<typeof addCartItemOutputSchema>;

export const updateCartItemInputSchema = z.object({
  quantity: z.number().int().min(1),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemInputSchema>;

export const updateCartItemOutputSchema = getCartOutputSchema;
export type UpdateCartItemOutput = z.infer<typeof updateCartItemOutputSchema>;

export const deleteCartItemOutputSchema = getCartOutputSchema;
export type DeleteCartItemOutput = z.infer<typeof deleteCartItemOutputSchema>;
