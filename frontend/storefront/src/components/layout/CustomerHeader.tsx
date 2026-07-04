"use client";

import React from "react";
import { motion } from "framer-motion";
import { Search, Menu, Bell } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useQrSessionContext } from "@/providers/qr-session-provider";
import { useLocale } from "@/providers/locale-provider";
import { useTranslation } from "@/lib/i18n";


export const CustomerHeader: React.FC<{ merchantName?: string; tableName?: string; toggleSidebar?: () => void }> = ({ merchantName, tableName, toggleSidebar = () => {} }) => {
  const router = useRouter();
  const { tenantSlug } = useParams() as { tenantSlug: string };
  const { qrToken } = useQrSessionContext();
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();
  const base = `/${tenantSlug}`;
  const query = qrToken ? `?qr=${qrToken}` : '';

  const handleToggleLanguage = () => {
    setLocale(locale === "en" ? "km" : "en");
  };

  return (
    <header
      className="sticky top-0 z-50 mx-2 sm:mx-4 rounded-[28px] sm:rounded-[32px]"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.65)", // Exact match to nav-bottom
        backdropFilter: "blur(32px) saturate(180%)",
        WebkitBackdropFilter: "blur(32px) saturate(180%)",
        boxShadow: "0 14px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0,0,0,0.05)",
        border: "1px solid rgba(255, 255, 255, 0.4)"
      }}
    >
      <div className="relative z-10 w-full px-3 sm:px-5 pt-3 sm:pt-4 pb-3 sm:pb-4">
        {/* ── Row 1: Brand + Icons ──────────────────────────────── */}
        <div className="flex items-center justify-between mb-3 sm:mb-4 gap-1">

          {/* Left: Hamburger + Brand */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <motion.button
              whileTap={{ scale: 0.88 }}
              className="text-primary"
              onClick={toggleSidebar}
            >
              <Menu size={24} strokeWidth={2.5} className="sm:w-[26px] sm:h-[26px]" />
            </motion.button>
            <h1 className="text-primary font-jakarta font-black text-[20px] sm:text-[24px] leading-normal tracking-tight line-clamp-1 max-w-[150px] sm:max-w-none pt-1">
              {merchantName || "Craving"}
            </h1>
          </div>

          {/* Right: Table Badge (if any) + Notification + Flag */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Table Name Badge */}
            {tableName && (
              <div className="bg-primary/10 text-primary px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] font-black tracking-widest border border-primary/20 backdrop-blur-md shadow-sm">
                {tableName}
              </div>
            )}

            {/* Bell Icon */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => router.push(`${base}/notifications${query}`)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 border border-white shadow-sm text-zinc-500 relative transition-transform"
            >
              <Bell size={20} />
              <span className="absolute top-2 right-[9px] w-2 h-2 bg-primary rounded-full border border-white animate-pulse" />
            </motion.button>

            {/* Language Toggle Flag */}
            <motion.div
              whileTap={{ scale: 0.88 }}
              onClick={handleToggleLanguage}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 border border-white shadow-sm overflow-hidden p-[8px] cursor-pointer hover:bg-white transition-colors"
            >
              <img
                src={locale === "en" ? "https://flagcdn.com/w80/gb.png" : "https://flagcdn.com/w80/kh.png"}
                alt={locale === "en" ? "English" : "Khmer"}
                className="w-full h-full object-cover rounded-[2px]"
              />
            </motion.div>
          </div>
        </div>

        {/* ── Row 2: Dual Search Inputs ─────────────────────────── */}
        <div className="flex gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-20">
              <Search size={16} className="text-zinc-500" />
            </div>
            <input
              type="text"
              placeholder={t("header.searchPlaceholder")}
              className="relative z-10 w-full h-[46px] pl-10 pr-3 rounded-2xl text-[13px] text-zinc-700 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-primary/40 transition-all bg-transparent"
            />
            {/* Input Glass Background */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.4)",
                backdropFilter: "blur(12px) saturate(140%)",
                WebkitBackdropFilter: "blur(12px) saturate(140%)",
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.02)"
              }}
            />
          </div>

        </div>
      </div>
    </header>
  );
};

