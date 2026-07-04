"use client";

import React, { useState, useEffect } from "react";
import { ShoppingCart, Trash2, ChevronLeft, CheckCircle2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/providers/locale-provider";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { GlassHeader } from "@/components/layout/GlassHeader";
import { ConfirmationLoader } from "@/components/layout/ConfirmationLoader";
import { useCart, RemoveItemDialog } from "@/features/cart";
import { getStorefrontContext } from "@/lib/api/storefront";
import { useQrSessionContext } from "@/providers/qr-session-provider";
import { useTranslation } from "@/lib/i18n";

export default function CartPage() {
  const router = useRouter();
  const params = useParams();
  const { qrToken } = useQrSessionContext();
  const { t } = useTranslation();
  const { locale } = useLocale();
  const tenantSlug = params?.tenantSlug as string;
  
  const query = qrToken ? `?qr=${qrToken}` : '';
  const base = `/${tenantSlug}${query}`;

  const { cart, updateQuantity, placeOrder } = useCart();
  const items = [...(cart?.items || [])]
    .filter((i: any) => i && i.id)
    .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
  const hasItems = items.length > 0;
  const subtotal = (cart?.subtotalCents || 0) / 100;

  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [productsMap, setProductsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!tenantSlug) return;
    setLoading(true);
    getStorefrontContext(tenantSlug)
      .then((res) => {
        const map: Record<string, any> = {};
        res.menu.categories.forEach((cat: any) => {
          cat.items.forEach((item: any) => {
            map[item.id] = {
              name: locale === "km" ? (item.name.km || item.name.en || "") : (item.name.en || item.name.km || ""),
              imageUrl: item.imageUrl || "https://placehold.co/400x400/png",
            };
          });
        });
        setProductsMap(map);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load storefront context in cart", err);
        setLoading(false);
      });
  }, [tenantSlug, locale]);

  const handleCheckout = () => {
    router.push(`/${tenantSlug}/checkout${query}`);
  };

  // Safe Hydration Loading State
  if (!mounted || loading) {
    return (
      <div className="min-h-screen relative bg-white">
        <ConfirmationLoader 
          title={t("cart.checkout")} 
          description={t("common.loading")} 
          fullScreen={true} 
        />
      </div>
    );
  }

  // Empty state
  if (!hasItems) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center gap-10 bg-white animate-ui-entry">
        <div className="w-20 h-20 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-200 border border-zinc-100">
          <ShoppingCart size={32} strokeWidth={1.5} />
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{t("cart.empty")}</h2>
          <p className="text-zinc-400 text-sm font-medium">{t("cart.emptyDesc")}</p>
        </div>
        <button
          onClick={() => router.push(base)}
          className="bg-primary text-white h-[56px] rounded-[18px] px-8 font-normal text-[15px] transition-colors hover:bg-primary/90"
        >
          {t("cart.exploreMenu")}
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-background-sunken)] font-sans pb-32 selection:bg-primary/20">
      {/* 🧊 Glass Header Wrapper */}
      <div className="max-w-[1000px] mx-auto w-full">
        <GlassHeader
          title={t("cart.title")}
          onBack={() => router.push(base)}
        />
      </div>

      <div className="max-w-[1000px] mx-auto w-full">
        {/* Typography Header */}
        <div className="px-6 pt-10 pb-8">
          <p className="text-[15px] text-zinc-900 font-medium leading-relaxed max-w-[280px]">
            {t("cart.yourSelectedDishes")} <span className="font-black text-primary tracking-tight">{t("cart.beOrdered")}</span>
          </p>
        </div>

        {/* Cart List — swipe-to-remove Figma style */}
        <div className="px-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <AnimatePresence>
            {items.map((item: any) => {
              const productInfo = productsMap[item.menuItemId] || { name: item.menuItemId, imageUrl: "https://placehold.co/400x400/png" };
              
              return (
                <motion.div
                  key={item.id}
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
                        <Image src={productInfo.imageUrl} alt={productInfo.name} fill className="object-cover" sizes="90px" />
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 flex flex-col justify-center gap-1">
                        <h4 className="text-[17px] font-black text-zinc-900 leading-none">{productInfo.name}</h4>
                        
                        <div className="flex flex-col gap-0.5 mt-1">
                          {item.variantSnapshot && (
                            <p className="text-[12px] text-zinc-500">
                              <span className="font-medium text-zinc-700">Size:</span> {item.variantSnapshot.nameEn || item.variantSnapshot.nameKm}
                            </p>
                          )}
                          
                          {item.optionsSnapshot && item.optionsSnapshot.length > 0 && (
                            <div className="text-[12px] text-zinc-500 flex flex-wrap gap-x-1">
                              <span className="font-medium text-zinc-700">Options:</span> 
                              {item.optionsSnapshot.map((opt: any) => opt.nameEn || opt.nameKm).join(', ')}
                            </div>
                          )}

                          {item.notes && (
                            <p className="text-[12px] text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md inline-block mt-0.5 w-fit">
                              Note: {item.notes}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-3">
                          <span className="text-[18px] font-black text-primary tabular-nums">
                            ${((item.lineTotalCents || (item.quantity * item.unitPriceCents)) / 100).toFixed(2)}
                          </span>

                          <div className="flex items-center gap-3 bg-[var(--color-background-sunken)] rounded-full p-1 border border-zinc-100">
                            <button 
                              onClick={() => {
                                if (item.quantity - 1 <= 0) {
                                  setItemToRemove(item.id);
                                } else {
                                  updateQuantity.mutate({ cartItemId: item.id, quantity: item.quantity - 1 });
                                }
                              }}
                              className="w-7 h-7 rounded-full bg-white text-zinc-900 flex items-center justify-center shadow-sm active:scale-90 transition-all"
                            >
                              <span className="text-[16px] font-medium leading-none -mt-[2px]">-</span>
                            </button>
                            <span className="text-[14px] font-bold w-4 text-center tabular-nums">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity.mutate({ cartItemId: item.id, quantity: item.quantity + 1 })}
                              className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shadow-sm active:scale-90 transition-all"
                            >
                              <span className="text-[16px] font-medium leading-none -mt-[2px]">+</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Snap reveal area — tap to trigger remove */}
                    <button
                      className="w-[80px] shrink-0 snap-center bg-transparent"
                      onClick={() => setItemToRemove(item.id)}
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Action Section */}
        <div className="px-6 mt-8 mb-6 max-w-[1000px] mx-auto w-full">
          <div className="bg-white rounded-[24px] p-6 border border-zinc-100 shadow-sm mb-6">
            <h3 className="text-[18px] font-black text-zinc-900 mb-4">{t("checkout.orderSummary")}</h3>
            <div className="flex items-center justify-between py-3 border-b border-zinc-50">
              <span className="text-[14px] text-zinc-500 font-medium">{t("cart.subtotal")}</span>
              <span className="text-[15px] font-bold text-zinc-900">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between py-4">
              <span className="text-[16px] font-black text-zinc-900">{t("cart.total")}</span>
              <span className="text-[22px] font-black text-primary">${subtotal.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            className="w-full bg-primary hover:bg-primary-hover active:bg-primary/90 text-white h-[60px] rounded-[20px] text-[16px] font-bold tracking-tight transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/30 disabled:opacity-70 disabled:active:scale-100 active:scale-[0.98]"
          >
            {t("cart.checkout")}
          </button>
        </div>
        
      </div> {/* End max-w container */}

      {itemToRemove && (
        <RemoveItemDialog 
          isOpen={true}
          onClose={() => setItemToRemove(null)}
          onConfirm={() => {
            updateQuantity.mutate({ cartItemId: itemToRemove, quantity: 0 }); 
            setItemToRemove(null);
          }}
        />
      )}
    </main>
  );
}
