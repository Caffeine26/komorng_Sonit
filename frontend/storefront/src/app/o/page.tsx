"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/providers/locale-provider";
import { useTranslation } from "@/lib/i18n";
import { motion } from "framer-motion";
import { Clock, ChevronRight, ShoppingBag, Loader2, ArrowLeft, Search, SlidersHorizontal, Lock, Receipt } from "lucide-react";
import { useAuth } from "@/features/customer/hooks/useAuth";
import { ConfirmationLoader } from "@/components/layout/ConfirmationLoader";
import { getCustomerOrderHistory } from "@/lib/api/storefront";
import type { StorefrontOrderHistoryItem } from "@xfos/contracts-bff-storefront";
import { CartFooter } from "@/features/cart/components/CartFooter";
import { useOrderAgain } from "@/features/orders";
import { useQrSessionContext } from "@/providers/qr-session-provider";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  NEW:       { label: "order.placed",     color: "text-blue-600",  bg: "bg-blue-50" },
  PREPARING: { label: "order.preparing",  color: "text-amber-600", bg: "bg-amber-50" },
  READY:     { label: "order.ready",      color: "text-emerald-600", bg: "bg-emerald-50" },
  COMPLETED: { label: "order.completed",  color: "text-zinc-500",  bg: "bg-zinc-100" },
  CANCELLED: { label: "order.cancelled",  color: "text-red-500",   bg: "bg-red-50" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({
  order,
  locale,
  onPress,
}: {
  order: StorefrontOrderHistoryItem;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.NEW;
  const totalUSD = (order.totalCents / 100).toFixed(2);
  const { handleOrderAgain, isReordering } = useOrderAgain();

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="w-full text-left bg-white rounded-[24px] shadow-sm border border-zinc-100 transition-shadow overflow-hidden flex flex-col"
    >
      <div className="p-5 cursor-pointer" onClick={onPress}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[15px] font-bold text-zinc-900 tracking-tight">
            #{order.orderNumber}
          </span>
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${status.color} ${status.bg}`}
          >
            {t(status.label, status.label.split('.')[1])}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 mt-2">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Clock size={12} />
            <span className="text-[12px]">
              {formatDate(order.createdAt)} · {formatTime(order.createdAt)}
            </span>
          </div>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1 text-zinc-700">
              <span className="text-[15px] font-bold">{t("invoice.grandTotal", "Total")}: ${totalUSD}</span>
            </div>
            <ChevronRight size={16} className="text-zinc-300" />
          </div>
        </div>
      </div>
      
      <div className="px-5 pb-5 pt-1 border-t border-zinc-50 flex justify-end">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleOrderAgain(order.items);
          }}
          disabled={isReordering}
          className="flex items-center justify-center gap-2 bg-primary/10 text-primary hover:bg-primary hover:text-white px-5 py-2.5 rounded-xl text-[14px] font-bold transition-all disabled:opacity-50"
        >
          {isReordering ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />}
          {t("order.orderAgain", "Order again")}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrderHistoryPage() {
  const router = useRouter();
  const { qrToken } = useQrSessionContext();
  const { locale } = useLocale();
  const { t } = useTranslation();
  
  const [tenantSlug, setTenantSlug] = useState<string>("");

  useEffect(() => {
    if (!tenantSlug) {
      const savedTenant = localStorage.getItem("xfos-last-tenant");
      if (savedTenant) setTenantSlug(savedTenant);
    }
  }, [tenantSlug]);

  const base = tenantSlug ? `/${tenantSlug}` : ``;
  const query = qrToken ? `?qr=${qrToken}` : "";
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  const [orders, setOrders] = useState<StorefrontOrderHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!qrToken) {
      setIsLoading(false);
      setError(t("orderHistory.noQrSession"));
      return;
    }

    let cancelled = false;

    async function fetchHistory() {
      try {
        const data = await getCustomerOrderHistory(qrToken!);
        if (!cancelled) {
          setOrders(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load order history.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [authLoading, qrToken]);

  const [searchQuery, setSearchQuery] = useState("");

  const filteredOrders = orders.filter(order => 
    order.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderContent = () => {
    if (authLoading || isLoading) {
      return (
        <div className="py-24">
          <ConfirmationLoader 
            title={t("confirmation.loadingOrders")} 
            description={t("confirmation.fetchingOrders")} 
            fullScreen={false} 
          />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4 px-8 text-center">
          <p className="text-zinc-400 text-sm">{error}</p>
        </div>
      );
    }

    if (filteredOrders.length === 0) {
      if (!isLoggedIn) {
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 gap-5 text-center px-8"
          >
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="text-primary" size={32} strokeWidth={2} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-zinc-900">{t("orderHistory.signIn")}</h3>
              <p className="text-zinc-500 text-sm max-w-[240px] mx-auto">
                {t("orderHistory.signInDesc")}
              </p>
            </div>
            <button 
              onClick={() => router.push(`${base}/profile${query}`)}
              className="mt-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-xl shadow-zinc-900/20 active:scale-95 transition-all"
            >
              {t("orderHistory.goToProfile")}
            </button>
          </motion.div>
        );
      }

      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 gap-5 text-center px-8"
        >
          <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center">
            <Receipt className="text-zinc-300" size={32} strokeWidth={2} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-zinc-900">{t("orderHistory.noOrders")}</h3>
            <p className="text-zinc-500 text-sm max-w-[240px] mx-auto">
              {t("orderHistory.noOrdersDesc")}
            </p>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        className="flex flex-col gap-3 pb-8"
      >
        {filteredOrders.map((order) => (
          <motion.div
            key={order.orderId}
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 280, damping: 24 } },
            }}
          >
            <OrderCard
              order={order}
              locale={locale}
              onPress={() => {
                const isCompleted = order.status === 'COMPLETED' || order.status === 'CANCELLED';
                const path = isCompleted ? `/o/history/${order.token}` : `/o/${order.token}` ;
                router.push(`${path}${qrToken ? `?qr=${qrToken}` : ""}`);
              }}
            />
          </motion.div>
        ))}
        {!isLoggedIn && (
          <div className="mt-4 p-6 bg-primary/5 rounded-[24px] border border-primary/10 text-center">
            <h4 className="text-[16px] font-bold text-zinc-900 mb-1">{t("orderHistory.seeAllOrders")}</h4>
            <p className="text-[13px] text-zinc-500 mb-4">{t("orderHistory.seeAllDesc")}</p>
            <div className="flex justify-center">
              <button 
                onClick={() => router.push(`${base}/profile${qrToken ? `?qr=${qrToken}` : ""}`)}
                className="px-6 py-3 bg-primary text-white text-sm font-bold rounded-[16px] active:scale-95 transition-transform"
              >
                {t("orderHistory.signInButton")}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <main className="mx-auto max-w-[1200px] w-full min-h-screen bg-[#F5F5F5] font-sans pb-40 overflow-x-hidden">
      {/* ── Fixed Pro Header Section (Liquid Glass Concept) ── */}
      <header 
        className="sticky top-0 z-50 mx-2 sm:mx-4 mt-2 sm:mt-4 rounded-[28px] sm:rounded-[32px]"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.65)",
          backdropFilter: "blur(32px) saturate(180%)",
          WebkitBackdropFilter: "blur(32px) saturate(180%)",
          boxShadow: "0 14px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0,0,0,0.05)",
          border: "1px solid rgba(255, 255, 255, 0.4)"
        }}
      >
        <div className="relative z-10 w-full px-3 sm:px-5 pt-3 sm:pt-4 pb-3 sm:pb-4">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <button 
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full bg-white/80 border border-white shadow-sm flex items-center justify-center text-zinc-900 active:scale-90 transition-transform"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-jakarta font-black text-[20px] sm:text-[22px] text-primary tracking-tight">
              {t("orderHistory.title")}
            </h1>
            <div className="w-10" />
          </div>

          {/* ── Search & Filter Bar ── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-20">
                <Search 
                  size={16} 
                  className="text-zinc-500 group-focus-within:text-zinc-900 transition-colors" 
                />
              </div>
              <input 
                type="text"
                placeholder={t("orderHistory.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
            
            <div className="w-[46px] relative">
              <button className="relative z-10 w-full h-[46px] rounded-2xl flex items-center justify-center text-zinc-700 shadow-sm active:scale-95 transition-transform bg-transparent outline-none focus:ring-2 focus:ring-primary/40">
                <SlidersHorizontal size={18} />
              </button>
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

      <div className="px-6 pt-8 pb-10">

        <div className="px-4 sm:px-6 pt-4">
          {/* Summary pill */}
          {!isLoading && !authLoading && isLoggedIn && orders.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[13px] text-zinc-400 font-medium mb-4 px-1"
            >
              {orders.length} {t("orderHistory.ordersFound", "orders found")}
            </motion.p>
          )}

          {renderContent()}
        </div>
      </div>
      
      {/* Footer Navigation */}
      <CartFooter />
    </main>
  );
}
