import React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useTranslation } from "@/lib/i18n";

interface CartActionBarProps {
  qty: number;
  onQtyChange: (newQty: number) => void;
  subtotal: number;
  isReadyToAdd: boolean;
  onAddToCart: () => void;
}

export const CartActionBar = ({ qty, onQtyChange, subtotal, isReadyToAdd, onAddToCart }: CartActionBarProps) => {
  const { t } = useTranslation();
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-zinc-100 p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-4">
        
        {/* Quantity Control */}
        <div className="flex items-center justify-between w-[120px] h-[54px] bg-zinc-100 rounded-full p-1.5 shrink-0">
          <button 
            onClick={() => onQtyChange(Math.max(1, qty - 1))}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-zinc-900 shadow-sm active:scale-95 transition-all disabled:opacity-50"
            disabled={qty <= 1}
          >
            <Minus size={18} strokeWidth={3} />
          </button>
          <span className="font-black text-[16px] text-zinc-900 w-6 text-center">{qty}</span>
          <button 
            onClick={() => onQtyChange(qty + 1)}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white shadow-sm active:scale-95 transition-all"
          >
            <Plus size={18} strokeWidth={3} />
          </button>
        </div>

        {/* Add to Cart Button */}
        <button 
          disabled={!isReadyToAdd}
          onClick={onAddToCart}
          className={cn(
            "flex-1 h-[54px] rounded-full flex items-center justify-center gap-2 font-black text-[16px] transition-all active:scale-[0.98]",
            isReadyToAdd 
              ? "bg-primary text-white shadow-[0_8px_20px_rgba(233,30,99,0.25)]" 
              : "bg-zinc-200 text-zinc-400"
          )}
        >
          <span>{t("product.addToCart")}</span>
          <span className="opacity-40 px-1 font-normal">•</span>
          <span>${subtotal.toFixed(2)}</span>
        </button>
      </div>
    </div>
  );
};
