"use client";

import React from "react";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCart } from "@/features/cart";

export const AddToCartButton = ({
  product,
  className,
  size = "md",
}: any) => {
  const isSmall = size === "sm";
  const { cart, addItem, updateQuantity } = useCart();
  const items = cart?.items || [];

  // Find current quantity in global store
  const cartItem = items.find((i: any) => i.menuItemId === product.id);
  const quantity = cartItem?.quantity || 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem.mutate({
      menuItemId: product.id,
      quantity: 1,
      unitPriceCents: product.price ? product.price * 100 : (product.basePriceCents || 0)
    });
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cartItem) {
      updateQuantity.mutate({ cartItemId: cartItem.id, quantity: quantity + 1 });
    }
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cartItem) {
      updateQuantity.mutate({ cartItemId: cartItem.id, quantity: quantity - 1 });
    }
  };

  return (
    <div className={cn("relative flex items-center justify-end", isSmall ? "h-8" : "h-10", className)}>
      {quantity === 0 ? (
        <button
          onClick={handleAdd}
          className={cn(
            "flex items-center justify-center rounded-full bg-primary text-white shadow-sm hover:brightness-110 active:scale-95 transition-all",
            isSmall ? "w-8 h-8 sm:w-10 sm:h-10" : "w-10 h-10"
          )}
        >
          <Plus className={isSmall ? "w-4 h-4 sm:w-6 sm:h-6" : "w-6 h-6"} strokeWidth={3.5} />
        </button>
      ) : (
        <div
          className={cn(
            "flex items-center rounded-full bg-zinc-100 border border-zinc-200 p-1 gap-1.5",
            isSmall ? "h-10" : "h-12"
          )}
        >
          <button
            onClick={handleDecrement}
            className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white text-primary shadow-sm active:bg-zinc-100 transition-colors"
          >
            <Minus size={16} strokeWidth={3} />
          </button>

          <div className="flex items-center justify-center min-w-[20px] sm:min-w-[28px]">
            <span
              className={cn(
                "font-jakarta font-black text-zinc-900 tabular-nums",
                isSmall ? "text-[15px] sm:text-[17px]" : "text-[18px]"
              )}
            >
              {quantity}
            </span>
          </div>

          <button
            onClick={handleIncrement}
            className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary text-white shadow-sm hover:brightness-110 active:bg-primary-hover transition-all"
          >
            <Plus size={16} strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  );
};
