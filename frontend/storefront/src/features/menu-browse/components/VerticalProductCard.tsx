"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { AddToCartButton } from "@/features/cart";
import { cn } from "@/lib/utils/cn";
import { useFavoritesStore } from "@/features/menu-browse";



/**
 * 🍱 VerticalProductCard — High-Fidelity Vertical View (2026)
 * 
 * Design Target: Large Image (Top, Full Width), Bold Titles (Bottom), 
 * Pure Black Text, 1 card per row (Full Width), Premium Pink Button.
 */
export const VerticalProductCard = ({
  product,
  className,
  onClick,
}: { product: any; className?: string; onClick?: () => void }) => {
  const { toggleFavorite, isFavorite } = useFavoritesStore();
  const favorited = isFavorite(product.id);
  
  const price = parseFloat(product.price.toString()).toFixed(2);
  const imageSrc = product.imageUrl || "/all.png";

  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={cn(
        "group relative flex flex-col overflow-hidden shrink-0",
        "bg-white rounded-[24px] shadow-sm border border-zinc-100/50",
        "hover:shadow-[0_12px_40px_rgba(0,0,0,0.05)] transition-all duration-300",
        "w-[320px] sm:w-[360px] md:w-[400px] h-[380px] sm:h-[415px] md:h-[450px]", // Enforce same height across cards
        className
      )}
    >
      {/* Top Image area - Uber Eats 4:3 ratio */}
      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-t-[24px] shrink-0">
        <Image
          src={imageSrc}
          alt={product.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-1000 ease-out rounded-[24px]"
        />
        
        {/* Popular Badge */}
        {product.code === "BEST" && (
          <div className="absolute top-3 left-3 bg-primary/95 backdrop-blur-md px-2.5 py-1 rounded-full shadow-lg">
            <span className="text-[9px] text-white font-black tracking-wide">Popular</span>
          </div>
        )}
        {/* Floating Heart / Favorite Icon */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(product.id);
          }}
          className={cn(
            "absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md transition-all z-10",
            favorited 
              ? "bg-primary text-white shadow-[0_4px_12px_rgba(233,30,99,0.3)]" 
              : "bg-black/20 text-white hover:bg-black/40"
          )}
        >
          <Heart size={18} strokeWidth={2.5} fill={favorited ? "currentColor" : "none"} />
        </motion.button>
      </div>

      {/* Content area - Elegant balanced typography */}
      <div className="flex-1 flex flex-col justify-between p-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-jakarta font-semibold text-[17px] sm:text-[18px] text-black leading-normal line-clamp-1">
            {product.name}
          </h3>
          
          {product.description ? (
            <p className="text-zinc-400 font-normal text-[14px] leading-normal line-clamp-1 opacity-90">
              {product.description}
            </p>
          ) : (
            <div className="h-[20px]" /> /* Spacer to align cards without descriptions */
          )}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2">
          <div className="flex items-baseline gap-0.5">
            <span className="font-jakarta font-bold text-[19px] sm:text-[20px] text-black">
              ${price}
            </span>
          </div>
          
          <AddToCartButton
            product={{
              id: product.id,
              name: product.name,
              price: product.price,
              imageUrl: product.imageUrl || undefined,
            }}
          />
        </div>
      </div>
    </motion.div>
  );
};
