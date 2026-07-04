"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { AddToCartButton } from "@/features/cart";
import { cn } from "@/lib/utils/cn";
import { useFavoritesStore } from "@/features/menu-browse";

export const HorizontalProductCard = ({
  product,
  className,
  onClick,
}: { product?: any; className?: string; onClick?: () => void }) => {
  const { toggleFavorite, isFavorite } = useFavoritesStore();
  const favorited = isFavorite(product?.id);

  const price = product?.price ? parseFloat(product.price.toString()).toFixed(2) : "0.00";
  const imageSrc = product?.imageUrl || "https://placehold.co/400x400/png";

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "group relative flex flex-row items-center px-4 pl-0 py-0 w-full",
        // Fixed height = exactly the image size so rectangle = circle height
        "h-[140px] sm:h-[160px]",
        // Left radius = half of image size (160px → 80px | 180px → 90px)
        "bg-white rounded-r-2xl rounded-l-[80px] sm:rounded-l-[90px]",
        "shadow-[0_2px_12px_rgba(0,0,0,0.05)]",
        "hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-all duration-300",
        "overflow-visible my-0",
        className
      )}
    >
      {/* ── Left: Circular Food Image ── */}
      <div
        className={cn(
          "relative shrink-0 rounded-full overflow-hidden bg-zinc-50 z-10",
          "border-[4px] sm:border-[5px] border-white",
          "shadow-[0_14px_28px_rgba(0,0,0,0.14)]",
          "w-[160px] h-[160px] sm:w-[180px] sm:h-[180px]",
          "-ml-3 sm:-ml-4",
          // Image is 20px taller than card → naturally overflows 10px top & bottom
        )}
      >
        <Image
          src={imageSrc}
          alt={product.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-700"
          sizes="(max-width: 768px) 170px, 170px"
        />
      </div>

      {/* ── Right Content ── */}
      <div className="flex-1 flex flex-col justify-start self-stretch min-w-0 py-3 pl-4 pr-2 gap-1">
        <div className="flex flex-col gap-0.5 relative">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-jakarta font-bold text-[18px] text-[#111] leading-normal line-clamp-1">
              {product.name}
            </h3>
            
            {/* Love Icon (Top-Right of text area) */}
            <motion.button
              whileTap={{ scale: 0.8 }}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(product.id);
              }}
              className={cn(
                "w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-md transition-all shrink-0",
                favorited 
                  ? "bg-primary/10 text-primary" 
                  : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
              )}
            >
              <Heart size={16} strokeWidth={2.5} fill={favorited ? "currentColor" : "none"} />
            </motion.button>
          </div>
          
          {product?.description && (
            <p className="text-[#888] font-normal text-[14px] leading-snug line-clamp-2">
              {product.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-auto pb-1">
          <span className="font-jakarta font-bold text-[16px] sm:text-[18px] text-[#111]">
            ${price}
          </span>
          <div style={{ marginRight: '-3px' }}>
            <AddToCartButton
              size="sm"
              product={{
                id: product?.id || "1",
                name: product?.name || "Product",
                price: product?.price || 0,
                imageUrl: product?.imageUrl || undefined,
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
