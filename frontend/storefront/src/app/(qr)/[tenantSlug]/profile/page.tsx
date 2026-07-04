"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { LogOut, ChevronRight, PenLine } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/providers/locale-provider";
import { CartFooter } from "@/features/cart";
import { GlassHeader } from "@/components/layout/GlassHeader";
import { useAuth } from "@/features/customer/hooks/useAuth";
import { CustomerProfileHeader } from "@/features/customer/components/CustomerProfileHeader";
import { PersonalInformation } from "@/features/customer/components/PersonalInformation";
import { LanguagePreference } from "@/features/customer/components/LanguagePreference";
import { useQrSessionContext } from "@/providers/qr-session-provider";
import { useTranslation } from "@/lib/i18n";

// ─── Animation Variants ───────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { tenantSlug } = useParams() as {
    tenantSlug: string;
  };
  const base = `/${tenantSlug}`;
  const { qrToken: contextQrToken } = useQrSessionContext();
  const qrToken = contextQrToken ?? "";
  const query = qrToken ? `?qr=${qrToken}` : "";

  const { isLoggedIn, isLoading, logout } = useAuth();
  const { t } = useTranslation();

  // ── Skeleton while session is rehydrating ───────────────────────────────────
  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#F5F5F7] font-sans pb-32">
        <div className="max-w-[1000px] mx-auto w-full">
          <GlassHeader title={t("profile.title")} onBack={() => router.push(`${base}${query}`)} />
        </div>
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 pt-8 flex flex-col items-center">
          {/* Avatar skeleton */}
          <div className="w-full max-w-[320px] flex flex-col items-center pt-4">
            <div className="w-[100px] h-[100px] rounded-[36px] bg-zinc-200 animate-pulse mb-4" />
            <div className="h-6 w-32 bg-zinc-200 rounded-full animate-pulse mb-2" />
            <div className="h-4 w-48 bg-zinc-100 rounded-full animate-pulse mb-6" />
            <div className="h-10 w-40 bg-zinc-200 rounded-full animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F5F7] font-sans pb-32 selection:bg-primary/20">

      {/* 🧊 Liquid Glass Header */}
      <div className="max-w-[1000px] mx-auto w-full">
        <GlassHeader title={t("profile.title")} onBack={() => router.push(`${base}${query}`)} />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="max-w-[1000px] mx-auto px-4 sm:px-6 pt-8 pb-20 flex flex-col items-center gap-10"
      >
        <CustomerProfileHeader itemVariants={itemVariants} />

        <div className="w-full max-w-[320px] flex flex-col gap-5">
          
          {/* Order History Card */}
          {isLoggedIn && (
            <motion.div variants={itemVariants} className="bg-white/60 backdrop-blur-[32px] border border-white shadow-[0_14px_30px_rgba(0,0,0,0.03)] rounded-[32px] p-2 overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <h3 className="font-jakarta font-black text-[16px] text-zinc-900 tracking-tight">
                  {t("nav.orders")}
                </h3>
              </div>
              <button
                onClick={() => router.push(`/o${query}`)}
                className="w-full flex items-center justify-between p-4 rounded-[24px] hover:bg-white/60 active:bg-zinc-100/50 transition-colors group min-h-[44px]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                    <PenLine size={18} strokeWidth={2.5} />
                  </div>
                  <span className="font-medium text-[15px] text-zinc-700">{t("orderHistory.title")}</span>
                </div>
                <ChevronRight
                  size={18}
                  strokeWidth={2}
                  className="text-zinc-400 group-hover:translate-x-0.5 transition-transform"
                />
              </button>
            </motion.div>
          )}

          <PersonalInformation itemVariants={itemVariants} />

          <LanguagePreference itemVariants={itemVariants} />

          {/* Logout */}
          <motion.div variants={itemVariants} className="pt-2 pb-6">
            {isLoggedIn && (
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-[24px] bg-red-50/50 text-red-500 font-bold text-[15px] hover:bg-red-50 active:scale-[0.98] transition-all border border-red-100/50 min-h-[44px]"
              >
                <LogOut size={18} strokeWidth={2.5} />
                {t("profile.signOut")}
              </button>
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* ── Persistent Navigation ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto">
          <CartFooter />
        </div>
      </div>
    </main>
  );
}