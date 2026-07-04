'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getCart, addCartItem, updateCartItem, removeCartItem, submitOrder } from '@/lib/api/cart';
import { useQrSession } from '@/lib/hooks/useQrSession';
import type { AddCartItemInput, SubmitOrderStorefrontInput } from '@xfos/contracts-bff-storefront';

// Define the interface for the Cart Context State
interface CartContextType {
  cart: any;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  addItem: {
    mutate: (input: AddCartItemInput) => void;
    mutateAsync: (input: AddCartItemInput) => Promise<any>;
    isPending: boolean;
  };
  updateQuantity: {
    mutate: (input: { cartItemId: string; quantity: number }) => void;
    mutateAsync: (input: { cartItemId: string; quantity: number }) => Promise<any>;
    isPending: boolean;
  };
  removeItem: {
    mutate: (cartItemId: string) => void;
    mutateAsync: (cartItemId: string) => Promise<any>;
    isPending: boolean;
  };
  placeOrder: {
    mutate: (input: Omit<SubmitOrderStorefrontInput, 'sessionId'>) => void;
    mutateAsync: (input: Omit<SubmitOrderStorefrontInput, 'sessionId'>) => Promise<any>;
    isPending: boolean;
  };
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { qrToken } = useQrSession();
  const [cart, setCart] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Pending states for mutations
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isRemoving, setIsRemoving] = useState<boolean>(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);

  // Fetch Cart Function
  const fetchCart = useCallback(async (token: string) => {
    setIsLoading(true);
    setIsError(false);
    setError(null);
    try {
      const data = await getCart(token);
      setCart(data);
    } catch (err: any) {
      setIsError(true);
      setError(err instanceof Error ? err : new Error(err?.message || 'Failed to fetch cart'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch cart automatically when qrToken changes
  useEffect(() => {
    if (qrToken) {
      fetchCart(qrToken);
    } else {
      setCart(null);
    }
  }, [qrToken, fetchCart]);

  // Mutation: Add Item
  const handleAddItem = useCallback(async (input: AddCartItemInput) => {
    if (!qrToken) throw new Error('No active QR session');
    setIsAdding(true);
    
    // Optimistic Update
    setCart((prev: any) => {
      const prevCart = prev || { items: [], itemCount: 0, subtotalCents: 0 };
      const newItems = [...(prevCart.items || [])];
      newItems.push({
        id: `temp-${Date.now()}`,
        menuItemId: input.menuItemId,
        quantity: input.quantity,
        unitPriceCents: input.unitPriceCents,
        lineTotalCents: input.quantity * input.unitPriceCents,
        notes: input.notes || null,
        variantSnapshot: input.variantId ? { nameEn: 'Selected Size', nameKm: 'Selected Size' } : null,
        optionsSnapshot: input.optionIds?.length ? input.optionIds.map(id => ({ id, nameEn: 'Option', nameKm: 'Option' })) : null,
      });
      return {
        ...prevCart,
        items: newItems,
        itemCount: prevCart.itemCount + input.quantity,
        subtotalCents: prevCart.subtotalCents + (input.quantity * input.unitPriceCents),
      };
    });

    try {
      const updatedCart = await addCartItem(qrToken, input);
      // Replace optimistic state with real state from backend (which includes cartId and real item IDs)
      setCart(updatedCart);
      return updatedCart;
    } catch (err: any) {
      fetchCart(qrToken); // Revert on error
      throw err instanceof Error ? err : new Error(err?.message || 'Failed to add item');
    } finally {
      setIsAdding(false);
    }
  }, [qrToken, fetchCart]);

  // Mutation: Update Quantity
  const handleUpdateQuantity = useCallback(async ({ cartItemId, quantity }: { cartItemId: string; quantity: number }) => {
    if (!qrToken) throw new Error('No active QR session');
    setIsUpdating(true);

    // Optimistic Update
    setCart((prev: any) => {
      if (!prev) return prev;
      const newItems = [...(prev.items || [])];
      const idx = newItems.findIndex((i: any) => i.id === cartItemId);
      if (idx > -1) {
        const item = newItems[idx];
        const diff = quantity - item.quantity;
        if (quantity <= 0) {
          newItems.splice(idx, 1);
        } else {
          item.quantity = quantity;
          item.lineTotalCents = item.quantity * item.unitPriceCents;
        }
        return {
          ...prev,
          items: newItems,
          itemCount: prev.itemCount + diff,
          subtotalCents: prev.subtotalCents + (diff * item.unitPriceCents),
        };
      }
      return prev;
    });

    try {
      if (quantity <= 0) {
        const updatedCart = await removeCartItem(qrToken, cartItemId);
        setCart(updatedCart);
        return updatedCart;
      } else {
        const updatedCart = await updateCartItem(qrToken, cartItemId, { quantity });
        setCart(updatedCart);
        return updatedCart;
      }
    } catch (err: any) {
      fetchCart(qrToken); // Revert on error
      throw err instanceof Error ? err : new Error(err?.message || 'Failed to update quantity');
    } finally {
      setIsUpdating(false);
    }
  }, [qrToken, fetchCart]);

  // Mutation: Remove Item
  const handleRemoveItem = useCallback(async (cartItemId: string) => {
    if (!qrToken) throw new Error('No active QR session');
    setIsRemoving(true);

    // Optimistic Update
    setCart((prev: any) => {
      if (!prev) return prev;
      const newItems = [...(prev.items || [])];
      const idx = newItems.findIndex((i: any) => i.id === cartItemId);
      if (idx > -1) {
        const item = newItems[idx];
        newItems.splice(idx, 1);
        return {
          ...prev,
          items: newItems,
          itemCount: prev.itemCount - item.quantity,
          subtotalCents: prev.subtotalCents - item.lineTotalCents,
        };
      }
      return prev;
    });

    try {
      const updatedCart = await removeCartItem(qrToken, cartItemId);
      setCart(updatedCart);
      return updatedCart;
    } catch (err: any) {
      fetchCart(qrToken); // Revert on error
      throw err instanceof Error ? err : new Error(err?.message || 'Failed to remove item');
    } finally {
      setIsRemoving(false);
    }
  }, [qrToken, fetchCart]);

  // Mutation: Place Order
  const handlePlaceOrder = useCallback(async (input: Omit<SubmitOrderStorefrontInput, 'sessionId'>) => {
    if (!qrToken) throw new Error('No active QR session');
    setIsPlacingOrder(true);
    try {
      const result = await submitOrder(qrToken, input);
      // Set flag so tracking page knows to show splash screen
      if (result.orderToken) {
        sessionStorage.setItem('just_submitted_order', result.orderToken);
      }
      // Clear cart state locally after placing order successfully
      setCart(null);
      return result;
    } catch (err: any) {
      throw err instanceof Error ? err : new Error(err?.message || 'Failed to place order');
    } finally {
      setIsPlacingOrder(false);
    }
  }, [qrToken]);

  // Public mutations matching the old TanStack useMutation signature
  const addItem = {
    mutate: (input: AddCartItemInput) => {
      handleAddItem(input).catch(() => {});
    },
    mutateAsync: handleAddItem,
    isPending: isAdding,
  };

  const updateQuantity = {
    mutate: (input: { cartItemId: string; quantity: number }) => {
      handleUpdateQuantity(input).catch(() => {});
    },
    mutateAsync: handleUpdateQuantity,
    isPending: isUpdating,
  };

  const removeItem = {
    mutate: (cartItemId: string) => {
      handleRemoveItem(cartItemId).catch(() => {});
    },
    mutateAsync: handleRemoveItem,
    isPending: isRemoving,
  };

  const placeOrder = {
    mutate: (input: Omit<SubmitOrderStorefrontInput, 'sessionId'>) => {
      handlePlaceOrder(input).catch(() => {});
    },
    mutateAsync: handlePlaceOrder,
    isPending: isPlacingOrder,
  };

  const refreshCart = useCallback(async () => {
    if (qrToken) {
      await fetchCart(qrToken);
    }
  }, [qrToken, fetchCart]);

  return (
    <CartContext.Provider
      value={{
        cart,
        isLoading,
        isError,
        error,
        addItem,
        updateQuantity,
        removeItem,
        placeOrder,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

// Hook that components call to access cart state
export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
