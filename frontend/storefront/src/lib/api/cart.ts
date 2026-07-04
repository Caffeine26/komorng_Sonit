import { apiFetch } from './client';
import {
  type GetCartOutput,
  type AddCartItemInput,
  type AddCartItemOutput,
  type UpdateCartItemInput,
  type UpdateCartItemOutput,
  type DeleteCartItemOutput,
  type SubmitOrderStorefrontInput,
  type SubmitOrderStorefrontOutput,
} from '@xfos/contracts-bff-storefront';

// Cart operations
export async function getCart(qrToken: string): Promise<GetCartOutput> {
  return apiFetch<GetCartOutput>('/api/v1/storefront/cart', {
    method: 'GET',
    searchParams: { qr: qrToken },
  });
}

export async function addCartItem(qrToken: string, input: AddCartItemInput): Promise<AddCartItemOutput> {
  return apiFetch<AddCartItemOutput>('/api/v1/storefront/cart/items', {
    method: 'POST',
    searchParams: { qr: qrToken },
    body: input,
  });
}

export async function updateCartItem(
  qrToken: string,
  cartItemId: string,
  input: UpdateCartItemInput
): Promise<UpdateCartItemOutput> {
  return apiFetch<UpdateCartItemOutput>(`/api/v1/storefront/cart/items/${cartItemId}`, {
    method: 'PATCH',
    searchParams: { qr: qrToken },
    body: input,
  });
}

export async function removeCartItem(qrToken: string, cartItemId: string): Promise<DeleteCartItemOutput> {
  return apiFetch<DeleteCartItemOutput>(`/api/v1/storefront/cart/items/${cartItemId}`, {
    method: 'DELETE',
    searchParams: { qr: qrToken },
  });
}

// Order operation

// Add items to an existing session (append only)
export async function addItemsToSession(
  qrToken: string,
  payload: { items: AddCartItemInput[]; requestId?: string },
): Promise<{ orderId: string; sessionId: string }> {
  return apiFetch<{ orderId: string; sessionId: string }>(
    '/api/v1/storefront/orders/add-items',
    {
      method: 'POST',
      searchParams: { qr: qrToken },
      body: payload,
    },
  );
}

export async function submitOrder(qrToken: string, input: Omit<SubmitOrderStorefrontInput, 'sessionId'>): Promise<SubmitOrderStorefrontOutput> {
  // sessionId is resolved on the backend by QrSessionGuard
  return apiFetch<SubmitOrderStorefrontOutput>('/api/v1/storefront/orders', {
    method: 'POST',
    searchParams: { qr: qrToken },
    body: input,
  });
}
