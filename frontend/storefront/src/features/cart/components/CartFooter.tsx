"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Home, Heart, ShoppingBag, PenLine, User } from "lucide-react";
import { useRouter, useParams, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useCart } from "@/features/cart";
import { useFavoritesStore } from "@/features/menu-browse";
import { useQrSessionContext } from "@/providers/qr-session-provider";
import { useTranslation } from "@/lib/i18n";

/**
 * 🍱 Pro Max CartFooter (Telegram-Style Liquid Glass)
 * Redesigned as a floating minimalist pill with deep frost and hover states.
 */
export const CartFooter = ({ tenantSlug: propTenantSlug }: { tenantSlug?: string } = {}) => {
  const router = useRouter();
  const params = useParams();
  
  const [tenantSlug, setTenantSlug] = useState<string>(propTenantSlug || "");

  useEffect(() => {
    if (propTenantSlug) {
      setTenantSlug(propTenantSlug);
      localStorage.setItem("xfos-last-tenant", propTenantSlug);
    } else {
      const paramTenant = params?.tenantSlug as string;
      if (paramTenant) {
        setTenantSlug(paramTenant);
        localStorage.setItem("xfos-last-tenant", paramTenant);
      } else {
        const savedTenant = localStorage.getItem("xfos-last-tenant");
        if (savedTenant) setTenantSlug(savedTenant);
      }
    }
  }, [params?.tenantSlug, propTenantSlug]);

  const currentTenant = (params?.tenantSlug as string) || tenantSlug;
  const base = currentTenant ? `/${currentTenant}` : ``;
  const globalBase = ``;

  // Subscribe to items array to trigger re-renders when cart changes
  const { cart } = useCart();
  
  // Hydration safety for Zustand persist (no longer needed for Zustand but good for general hydration)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const cartCount = mounted ? (cart?.itemCount || 0) : 0;
  const totalAmount = mounted ? ((cart?.subtotalCents || 0) / 100) : 0;
  const hasItems = cartCount > 0;
  const { favoriteIds } = useFavoritesStore();
  const favCount = mounted ? favoriteIds.length : 0;
  
  const pathname = usePathname() || "";
  
  // Dynamically determine active tab based on the current URL
  let active = "home";
  
  // Strict matching to prevent false positives
  const pathSegments = pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1];
  
  if (lastSegment === "favorites") active = "favorite";
  else if (lastSegment === "cart") active = "cart";
  else if (lastSegment === "o" || pathSegments.includes("o")) active = "orders";
  else if (lastSegment === "profile") active = "profile";
  
  const { qrToken } = useQrSessionContext();
  const query = qrToken ? `?qr=${qrToken}` : '';
  
  const { t } = useTranslation();

  const tabs = [
    { id: "home", label: t("nav.home"), icon: Home, path: currentTenant ? `${base}${query}` : null },
    { id: "favorite", label: t("nav.favorites"), icon: Heart, path: currentTenant ? `${base}/favorites${query}` : null, badgeCount: favCount },
    { id: "cart", label: t("nav.cart"), icon: ShoppingBag, path: currentTenant ? `${base}/cart${query}` : null, isMain: true, badgeCount: cartCount },
    { id: "orders", label: t("nav.orders"), icon: PenLine, path: `${globalBase}/o${query}` },
    { id: "profile", label: t("nav.profile"), icon: User, path: currentTenant ? `${base}/profile${query}` : null },
  ];

  return (
    <div className="fixed bottom-8 inset-x-0 z-[60] flex justify-center px-6 pointer-events-none">
      <motion.nav 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative pointer-events-auto flex items-center justify-between gap-1 p-2 rounded-full max-w-[400px] w-full"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.65)",
          backdropFilter: "blur(32px) saturate(180%)",
          WebkitBackdropFilter: "blur(32px) saturate(180%)",
          boxShadow: "0 14px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0,0,0,0.05)",
          border: "1px solid rgba(255, 255, 255, 0.4)"
        }}
      >
        {tabs.map((tab) => {
          const isCurrent = active === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.path) {
                  router.push(tab.path);
                }
              }}
              className="relative flex-1 group"
            >
              <div className={cn(
                "relative flex flex-col items-center justify-center py-2.5 rounded-[20px] transition-all duration-300",
                isCurrent 
                  ? "" 
                  : "hover:bg-white/40 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              )}>
                {/* Active Indicator Glow (Minimalist) */}
                {isCurrent && (
                  <motion.div 
                    layoutId="active-pill"
                    className="absolute inset-0 bg-primary/10 rounded-[20px]"
                    style={{
                      boxShadow: "inset 0 1px 1px rgba(255,255,255,0.4)"
                    }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}

                <Icon 
                  size={20} 
                  strokeWidth={isCurrent ? 2.5 : 2}
                  className={cn(
                    "transition-all duration-300",
                    isCurrent ? "text-primary scale-110" : "text-zinc-500 group-hover:text-zinc-900"
                  )}
                />
                
                <span className={cn(
                  "text-[10px] font-bold mt-1 transition-all duration-300 tracking-tight",
                  isCurrent ? "text-primary" : "text-zinc-400 group-hover:text-zinc-600"
                )}>
                  {tab.isMain && hasItems ? `$${totalAmount.toFixed(2)}` : tab.label}
                </span>

                {/* Notification Dot */}
                {tab.badgeCount ? (
                  <span className={cn(
                    "absolute top-1 h-[16px] min-w-[16px] flex items-center justify-center rounded-full bg-primary text-white text-[9px] font-black border-2 border-white shadow-sm px-1",
                    tab.isMain ? "right-[18px]" : "right-[14px]"
                  )}>
                    {tab.badgeCount}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </motion.nav>
    </div>
  );
};
