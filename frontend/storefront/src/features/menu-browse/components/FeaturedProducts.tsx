'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { AddToCartButton } from '@/features/cart';
import { cn } from '@/lib/utils/cn';
import { Heart } from 'lucide-react';
import { useFavoritesStore } from "@/features/menu-browse";
import { useTranslation } from "@/lib/i18n";

// 🔒 Global Session Lock
let globalHasCentered = false;

export const FeaturedProducts = React.memo(
  function FeaturedProducts({ products = [], onProductClick }: { products?: any[], onProductClick?: (p: any) => void }) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (globalHasCentered || !products || products.length === 0) return;

    // A single, clean paint cycle
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el && el.clientWidth > 0) {
        const children = Array.from(el.children) as HTMLElement[];
        const mid = Math.floor(children.length / 2);
        const card = children[mid];

        if (card) {
          const offset = card.offsetLeft - (el.clientWidth / 2) + (card.offsetWidth / 2);
          el.scrollTo({ left: offset, behavior: 'auto' });
          globalHasCentered = true;
        }
      }
    });
  }, [products?.length]);

  return (
    <div className="w-full mt-8">
      <div className="flex items-center justify-between px-5 mb-4">
        <h2 className="text-zinc-900 font-jakarta font-bold text-[18px]">{t("menu.mostPopular")}</h2>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto no-scrollbar pb-4 px-5 snap-x snap-mandatory"
      >  {products.map((product) => (
        <FeaturedCard key={product.id} product={product} onClick={() => onProductClick?.(product)} />
      ))}
      </div>
    </div>
  );
});

const FeaturedCard = ({ product, onClick }: { product: any; onClick?: () => void }) => {
  const { t } = useTranslation();
  const { toggleFavorite, isFavorite } = useFavoritesStore();
  const favorited = isFavorite(product.id);
  const price = parseFloat((product.price || 0).toString()).toFixed(2);
  const imageSrc = product?.imageUrl || 'https://placehold.co/400x400/png';

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative shrink-0 snap-center rounded-[36px] overflow-hidden shadow-2xl border border-white/10"
      style={{ width: '85vw', maxWidth: '340px', aspectRatio: '1/1.1' }}
    >
      {/* Full-bleed image */}
      <Image 
        src={imageSrc} 
        alt={product.name} 
        fill 
        className="object-cover"
        sizes="(max-width: 768px) 85vw, 340px"
      />

      {/* ── Top-Left Favorite Button ── */}
      <div className="absolute top-4 left-4 z-10">
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(product.id);
          }}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-xl border border-white/20 transition-all",
            favorited 
              ? "bg-primary text-white shadow-lg" 
              : "bg-black/30 text-white"
          )}
        >
          <Heart size={20} strokeWidth={2.5} fill={favorited ? "currentColor" : "none"} />
        </motion.button>
      </div>

      {/* ── Top-Right Popular Badge ── */}
      <div className="absolute top-4 right-4 z-10">
        <span className="bg-black/40 backdrop-blur-xl px-4 py-1.5 rounded-full text-[10px] text-white font-bold tracking-wider border border-white/20 shadow-xl">
          {t("menu.popular")}
        </span>
      </div>

      {/* ── Compact Bottom-Aligned Glass Footer ── */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end">
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: "rgba(2, 0, 0, 0.35)", // Slightly darker for better text contrast at bottom
            backdropFilter: "blur(8px) saturate(120%)",
            WebkitBackdropFilter: "blur(8px) saturate(120%)",
            maskImage: 'linear-gradient(to top, black 75%, transparent)',
            WebkitMaskImage: 'linear-gradient(to top, black 75%, transparent)',
            borderTop: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        />

        <div className="relative p-5 pb-6 flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-jakarta font-bold text-[20px] leading-normal line-clamp-1 tracking-tight">
              {product.name}
            </h3>
            <p className="text-white/80 font-jakarta text-[14px] line-clamp-2 mt-1 font-medium leading-relaxed">
              {product.description || "Expertly prepared with fresh ingredients to satisfy your cravings."}
            </p>
            <div className="mt-3">
              <span className="text-white font-jakarta font-black text-[26px] drop-shadow-md">
                ${price}
              </span>
            </div>
          </div>

          <div className="shrink-0 mb-1">
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
      </div>
    </motion.div>
  );
};
