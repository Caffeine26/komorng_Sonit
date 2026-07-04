"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  Home, 
  History, 
  Heart, 
  User, 
  LayoutGrid, 
  List, 
  X
} from "lucide-react";

import { useRouter, useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useTranslation } from "@/lib/i18n";
import { useQrSessionContext } from "@/providers/qr-session-provider";

/**
 * 🧊 CustomerSidebar — Deep Frosted iOS Glass
 */
export const CustomerSidebar = ({
  isSidebarOpen = true,
  setSidebarOpen = (v: boolean) => {},
  viewMode = "list",
  setViewMode = (v: string) => {}
}: {
  isSidebarOpen?: boolean;
  setSidebarOpen?: (v: boolean) => void;
  viewMode?: string;
  setViewMode?: (v: string) => void;
} = {}) => {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname() || "";
  
  const tenantSlug = (params?.tenantSlug as string) || "";
  const base = `/${tenantSlug}`;
  const globalBase = ``;

  // Dynamically determine active tab based on the URL
  let activeItem = "Menu";
  const pathSegments = pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1];

  if (lastSegment === "favorites") activeItem = "Favorites";
  else if (lastSegment === "o" || pathSegments.includes("o")) activeItem = "Order history";
  else if (lastSegment === "profile") activeItem = "Profile";

  const { t } = useTranslation();
  const { qrToken } = useQrSessionContext();
  const query = qrToken ? `?qr=${qrToken}` : '';

  const navItems = [
    { name: t("nav.menu"),          icon: Home,  id: "menu",      path: `${base}${query}` },
    { name: t("nav.orders"), icon: History, id: "history", path: `${globalBase}/o${query}` },
    { name: t("nav.favorites"),     icon: Heart, id: "favorites", path: `${base}/favorites${query}` },
    { name: t("nav.profile"),       icon: User,  id: "profile",   path: `${base}/profile${query}` },
  ];

  return (
    <>
      {/* 🌫️ Dim Overlay for Background - 25% with soft blur as requested */}
      <motion.div
        initial={false}
        animate={{ 
          opacity: isSidebarOpen ? 1 : 0,
          pointerEvents: isSidebarOpen ? "auto" : "none" as any
        }}
        onClick={() => setSidebarOpen(false)}
        className="fixed inset-0 z-[9998] bg-black/25 backdrop-blur-md"
      />

      {/* 🧊 Sidebar Base container */}
      <motion.aside
        initial={false}
        animate={{ 
          x: isSidebarOpen ? 0 : "-100%",
          opacity: isSidebarOpen ? 1 : 0
        }}
        transition={{ 
          duration: 0.24,
          ease: "easeInOut"
        }}
        className={cn(
          "fixed top-0 left-0 bottom-0 z-[9999] flex flex-col",
          "w-[75%] md:w-[25%] min-w-[280px] max-w-[340px]",
          "rounded-r-[24px] overflow-hidden",
          "shadow-[20px_0_40px_rgba(0,0,0,0.15)]"
        )}
      >
        {/* ── Deep Frosted iOS Glass Background (from CartFooter) ── */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.65)", // True Apple light frosted glass
            backdropFilter: "blur(32px) saturate(180%)",
            WebkitBackdropFilter: "blur(32px) saturate(180%)",
            boxShadow: "inset -1px 0 0 rgba(255, 255, 255, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.9)"
          }}
        />

        {/* Top Spacing / Safe Area & Header Controls */}
        <div className="relative z-10 pt-14 px-6 flex items-center justify-between shrink-0">
          
          {/* View Card Toggle */}
          <div className="flex gap-1.5 p-1 bg-white/40 rounded-2xl border border-white/50 shadow-sm backdrop-blur-md">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex items-center gap-2 px-3 h-9 rounded-xl transition-all",
                viewMode === "grid" 
                  ? "bg-white text-zinc-900 shadow-sm border border-white/80" 
                  : "text-zinc-500 hover:bg-white/60 hover:text-zinc-800"
              )}
            >
              <LayoutGrid size={16} />
              {viewMode === "grid" && <span className="text-[12px] font-bold">{t("menu.grid")}</span>}
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-2 px-3 h-9 rounded-xl transition-all",
                viewMode === "list" 
                  ? "bg-white text-zinc-900 shadow-sm border border-white/80" 
                  : "text-zinc-500 hover:bg-white/60 hover:text-zinc-800"
              )}
            >
              <List size={16} />
              {viewMode === "list" && <span className="text-[12px] font-bold">{t("menu.list")}</span>}
            </button>
          </div>

          {/* Close Sidebar */}
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => setSidebarOpen(false)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/50 hover:bg-white/80 text-zinc-600 transition-all border border-white/60 shadow-sm"
          >
            <X size={20} strokeWidth={2.5} />
          </motion.button>
        </div>

        {/* Navigation List */}
        <nav className="relative z-10 flex-1 px-4 space-y-2 mt-8">
          {navItems.map((item) => {
            const isActive = activeItem === item.name;
            return (
              <button
                key={item.name}
                onClick={() => {
                  setSidebarOpen(false);
                  router.push(item.path);
                }}
                className={cn(
                  "w-full h-[52px] flex items-center gap-4 px-5 rounded-2xl transition-all duration-200 group",
                  isActive 
                    ? "bg-white text-zinc-900 shadow-sm border border-white/80" 
                    : "text-zinc-600 hover:bg-white/60 hover:text-zinc-900"
                )}
              >
                <item.icon 
                  size={20} 
                  strokeWidth={isActive ? 2.5 : 2} 
                />
                <span className={cn(
                  "text-[16px] tracking-tight",
                  isActive ? "font-bold text-zinc-900" : "font-semibold text-zinc-600"
                )}>
                  {item.name}
                </span>
              </button>
            );
          })}
        </nav>
      </motion.aside>
    </>
  );
};
