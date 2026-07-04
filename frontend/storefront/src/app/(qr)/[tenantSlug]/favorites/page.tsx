"use client";

import React, { useState } from "react";
import { Heart, Trash2, ChevronLeft, ShoppingCart, ChevronRight } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/providers/locale-provider";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { GlassHeader } from "@/components/layout/GlassHeader";
import { AddToCartButton } from "@/features/cart";

import { useFavoritesStore } from "@/features/menu-browse";
import { getStorefrontContext } from "@/lib/api/storefront";
import { useEffect } from "react";

import { useQrSessionContext } from "@/providers/qr-session-provider";
import { useTranslation } from "@/lib/i18n";

export default function FavoritesPage({
  params,
}: {
  params: { tenantSlug: string };
}) {
  const router = useRouter();
  const { qrToken } = useQrSessionContext();
  const { tenantSlug } = useParams() as { tenantSlug: string };
  const { locale } = useLocale();
  const { t } = useTranslation();
  const query = qrToken ? `?qr=${qrToken}` : '';
  const base = `/${tenantSlug}`;

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const favoriteIds = useFavoritesStore((state) => state.favoriteIds);
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);

  useEffect(() => {
    setMounted(true);
    if (!tenantSlug) return;
    setLoading(true);
    getStorefrontContext(tenantSlug)
      .then((res) => {
        const allProducts: any[] = [];
        res.menu.categories.forEach((cat: any) => {
          cat.items.forEach((item: any) => {
            allProducts.push({
              id: item.id,
              name: locale === "km" ? (item.name.km || item.name.en || "") : (item.name.en || item.name.km || ""),
              price: item.priceCents / 100,
              imageUrl: item.imageUrl || "https://placehold.co/400x400/png",
            });
          });
        });
        setProducts(allProducts);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load storefront context in favorites", err);
        setLoading(false);
      });
  }, [tenantSlug, locale]);

  const favoriteItems = products.filter((p) => favoriteIds.includes(p.id));

  // Safe Hydration Loading State
  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center gap-10 bg-white">
        <div className="w-20 h-20 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-200 border border-zinc-100">
          <Heart size={32} strokeWidth={1.5} className="animate-pulse text-primary" />
        </div>
      </div>
    );
  }

  // Empty state
  if (favoriteItems.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center gap-10 bg-white animate-ui-entry">
        <div className="w-20 h-20 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-200 border border-zinc-100">
          <Heart size={32} strokeWidth={1.5} />
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{t("favorites.empty")}</h2>
          <p className="text-zinc-400 text-sm font-medium">{t("favorites.emptyDesc")}</p>
        </div>
        <button
          onClick={() => router.push(`${base}${query}`)}
          className="bg-primary text-white h-[56px] rounded-[18px] px-8 font-normal text-[15px] transition-colors hover:bg-primary/90"
        >
          {t("cart.exploreMenu")}
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-background-sunken)] font-sans pb-12 selection:bg-primary/20">
      {/* 🧊 Glass Header Wrapper */}
      <div className="max-w-[1000px] mx-auto w-full">
        <GlassHeader
          title={t("favorites.title")}
          onBack={() => router.push(`${base}${query}`)}
        />
      </div>

      <div className="max-w-[1000px] mx-auto w-full">
        {/* Typography Header */}
        <div className="px-6 pt-10 pb-8">
          <p className="text-[15px] text-zinc-900 font-medium leading-relaxed max-w-[280px]">
            {t("favorites.lovedDishes")} <span className="font-black text-primary tracking-tight">{t("favorites.theMenu")}</span>
          </p>
        </div>

        {/* Favorites List — swipe-to-remove Figma style (Responsive Grid on Desktop) */}
        <div className="px-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <AnimatePresence>
            {favoriteItems.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.22 }}
                className="relative overflow-hidden rounded-[32px] bg-primary shadow-sm flex flex-col"
              >
                {/* Background Trash Layer */}
                <div className="absolute inset-y-0 right-0 w-[80px] flex items-center justify-center text-white z-0">
                  <Trash2 size={24} strokeWidth={2.5} />
                </div>

                {/* Foreground Content — horizontal scroll snap */}
                <div className="flex flex-1 overflow-x-auto snap-x snap-mandatory no-scrollbar w-full relative z-10 touch-pan-x items-stretch">
                  {/* Card Body */}
                  <div className="w-full shrink-0 snap-center bg-white p-5 flex gap-5 border-r border-zinc-100 h-full min-h-full">
                    {/* Square Image */}
                    <div className="relative w-[90px] h-[90px] shrink-0 bg-zinc-50 rounded-[24px] overflow-hidden">
                      <Image src={item.imageUrl} alt={item.name} fill className="object-cover" sizes="90px" />
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 flex flex-col justify-center gap-1">
                      <div className="flex justify-between items-start">
                        <h4 className="text-[17px] font-black text-zinc-900 leading-none">{item.name}</h4>
                      </div>

                      <div className="flex items-center justify-between mt-4">
                        <span className="text-[18px] font-black text-primary tabular-nums">
                          ${item.price.toFixed(2)}
                        </span>

                        <AddToCartButton
                          product={{
                            id: item.id,
                            name: item.name,
                            price: item.price,
                            imageUrl: item.imageUrl,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Snap reveal area — tap to trigger remove */}
                  <button
                    className="w-[80px] shrink-0 snap-center bg-transparent"
                    onClick={() => toggleFavorite(item.id)}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Action Section */}
        <div className="px-6 mt-12 mb-12 max-w-[1000px] mx-auto w-full">
          <button
            onClick={() => router.push(`${base}/cart${query}`)}
            className="w-full bg-primary hover:bg-primary-hover active:bg-primary/90 text-white h-[56px] rounded-[18px] text-[15px] font-normal tracking-tight transition-colors flex items-center justify-center gap-2"
          >{t("favorites.goToCart")}
            <ChevronRight size={18} strokeWidth={2} />
          </button>
        </div>

      </div> {/* End max-w container */}
    </main>
  );
}
