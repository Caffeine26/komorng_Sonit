"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Bell, 
  ChefHat, 
  CreditCard, 
  Gift, 
  Info,
  Check
} from "lucide-react";
import { GlassHeader } from "@/components/layout/GlassHeader";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/features/customer/hooks/useAuth";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { useTranslation } from "@/lib/i18n";

function getRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
}

const iconMap: Record<string, any> = {
  ChefHat,
  CreditCard,
  Gift,
  Check,
  Bell,
};

export default function NotificationsPage() {
  const router = useRouter();
  const { tenantSlug } = useParams() as { tenantSlug: string };
  const base = `/${tenantSlug}`;
  
  const { isLoggedIn } = useAuth();
  const { notifications, isLoading, markAsRead } = useNotifications(tenantSlug, isLoggedIn);
  const { t } = useTranslation();

  const handleMarkAsRead = (id: string) => {
    markAsRead(id);
  };

  return (
    <main className="min-h-screen bg-[#F5F5F7] font-sans pb-32 selection:bg-primary/20">
      
      {/* 🧊 Liquid Glass Header */}
      <GlassHeader 
        title={t("notifications.title")} 
        onBack={() => router.push(base)} 
      />

      <div className="pt-8 px-4 sm:px-6 max-w-lg mx-auto space-y-4">
        <AnimatePresence mode="popLayout">
          {notifications.map((item) => {
            const Icon = item.icon && iconMap[item.icon] ? iconMap[item.icon] : Bell;
            const isUnread = !item.isRead;
            return (
              <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={item.id}
                onClick={() => {
                  if (isUnread) handleMarkAsRead(item.id);
                  if (item.actionUrl) router.push(item.actionUrl);
                }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "group relative p-4 sm:p-5 rounded-[32px] border transition-all duration-300 cursor-pointer flex gap-4 items-start overflow-hidden",
                  isUnread 
                    ? "bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)] border-white" 
                    : "bg-white/60 backdrop-blur-[32px] border-white shadow-[0_14px_30px_rgba(0,0,0,0.02)]"
                )}
              >
                {/* ── Brand Unified Icon Container ── */}
                <div className={cn(
                  "w-12 h-12 rounded-[20px] flex items-center justify-center shrink-0 transition-colors duration-300",
                  isUnread
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "bg-primary/10 text-primary"
                )}>
                  <Icon size={22} strokeWidth={2.5} />
                </div>

                {/* ── Content (Sentence Case Strict) ── */}
                <div className="flex-1 space-y-1.5 pr-6 mt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={cn(
                      "text-[15px] tracking-tight leading-tight",
                      isUnread ? "font-black text-zinc-900" : "font-bold text-zinc-700"
                    )}>
                      {item.title}
                    </h3>
                  </div>
                  <p className={cn(
                    "text-[13px] font-medium leading-relaxed line-clamp-2",
                    isUnread ? "text-zinc-600" : "text-zinc-500"
                  )}>
                    {item.body}
                  </p>
                  <span className="inline-block mt-1 text-[11px] font-bold text-zinc-400">
                    {getRelativeTime(item.createdAt)}
                  </span>
                </div>

                {/* ── Unread Indicator / Read Checkmark ── */}
                <div className="absolute top-5 right-5 flex items-center justify-center">
                  {isUnread ? (
                    <motion.div 
                      layoutId={`indicator-${item.id}`}
                      className="w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_8px_rgba(233,30,99,0.5)]" 
                    />
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-primary/30"
                    >
                      <Check size={16} strokeWidth={3} />
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* ── Clean Footer Info (Zero Uppercase) ── */}
        <div className="pt-10 pb-6 text-center">
          <p className="text-[13px] font-medium text-zinc-400 flex items-center justify-center gap-1.5">
            <Info size={14} className="text-zinc-300" strokeWidth={2.5} /> 
            {t("notifications.footer")}
          </p>
        </div>
      </div>
    </main>
  );
}
