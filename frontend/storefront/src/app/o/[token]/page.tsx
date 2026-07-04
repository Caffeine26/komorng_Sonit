"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/providers/locale-provider";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, Package, Navigation2, MapPin, CheckCircle2, Gift, FileText, ChefHat, ShoppingBag, Loader2, Send } from "lucide-react";
import Image from "next/image";
import { GlassHeader } from "@/components/layout/GlassHeader";
import { ConfirmationLoader } from "@/components/layout/ConfirmationLoader";
import { getStorefrontOrderStatus, getStorefrontContext } from "@/lib/api/storefront";
import type { StorefrontOrderStatusResponse } from "@xfos/contracts-bff-storefront";
import { OrderSuccessCard } from "@/features/checkout";
import { useAuth } from "@/features/customer/hooks/useAuth";
import { CartFooter } from "@/features/cart/components/CartFooter";
import { useOrderAgain } from "@/features/orders";
import { useQrSessionContext } from "@/providers/qr-session-provider";
import { useTranslation } from "@/lib/i18n";

export default function OrderTrackingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useParams() as { token: string };
  const { locale } = useLocale();
  const { t } = useTranslation();
  const { qrToken } = useQrSessionContext();
  const base = ``;
  const qr = qrToken ?? "";
  const query = qr ? `?qr=${qr}` : '';

  const [order, setOrder] = useState<StorefrontOrderStatusResponse | null>(null);
  const [productsMap, setProductsMap] = useState<Record<string, any>>({});
  const [tenantInfo, setTenantInfo] = useState<{ nameEn: string, nameKm: string, logoUrl: string | null }>({ nameEn: '', nameKm: '', logoUrl: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user, setUser, isLoading: authLoading } = useAuth();
  const [showTrackerMobile, setShowTrackerMobile] = useState(false);
  const [showSuccessSplash, setShowSuccessSplash] = useState(searchParams?.get('success') === 'true');
  const telegramPopupShown = useRef(false);
  const [showTelegramWaitPopup, setShowTelegramWaitPopup] = useState(false);

  const { handleOrderAgain, isReordering } = useOrderAgain();

  // Fetch order data and menu context for images
  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const orderData = await getStorefrontOrderStatus(token);
        if (!mounted) return;
        setOrder(orderData);

        // Fetch context to get images if possible
        if (orderData.tenant?.slug) {
          localStorage.setItem("xfos-last-tenant", orderData.tenant.slug);

          try {
            const contextRes = await getStorefrontContext(orderData.tenant.slug);
            if (mounted) {
              setTenantInfo({
                nameEn: typeof contextRes.tenant?.name === 'string' ? contextRes.tenant.name : (contextRes.tenant?.name?.en || contextRes.tenant?.name?.km || orderData.tenant.name),
                nameKm: typeof contextRes.tenant?.name === 'string' ? contextRes.tenant.name : (contextRes.tenant?.name?.km || contextRes.tenant?.name?.en || orderData.tenant.name),
                logoUrl: contextRes.tenant?.logoUrl || null
              });
            }

            const map: Record<string, any> = {};
            contextRes.menu.categories.forEach((cat: any) => {
              cat.items.forEach((item: any) => {
                const mappedItem = {
                  imageUrl: item.images?.[0]?.imageUrl || item.imageUrl || "https://placehold.co/400x400/png",
                  nameEn: item.name.en,
                  nameKm: item.name.km,
                };
                if (item.id) map[item.id] = mappedItem;
                if (item.name.en) map[item.name.en] = mappedItem;
                if (item.name.km) map[item.name.km] = mappedItem;
              });
            });
            if (mounted) setProductsMap(map);
          } catch (e) {
            console.error("Failed to load context", e);
          }
        }
        if (mounted) setIsLoading(false);
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          setIsLoading(false);
        }
      }
    };

    fetchData();
    const intervalId = setInterval(() => {
      getStorefrontOrderStatus(token).then((data) => {
        if (mounted) setOrder(data);
      }).catch(console.error);
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [token]);

  // Handle Splash Screen duration and clear URL param
  useEffect(() => {
    let splashTimer: NodeJS.Timeout;

    // Fallback: If we still have showSuccessSplash from URL, hide it after 2.5s
    if (order && !isLoading && showSuccessSplash) {
      splashTimer = setTimeout(() => {
        setShowSuccessSplash(false);
      }, 2500);
    }

    // New logic: Check sessionStorage flag to show splash screen once per order
    if (order && !isLoading) {
      const justSubmitted = sessionStorage.getItem('just_submitted_order');
      if (justSubmitted === token) {
        setShowSuccessSplash(true);
        sessionStorage.removeItem('just_submitted_order');
        splashTimer = setTimeout(() => {
          setShowSuccessSplash(false);
        }, 2500);
      }
    }

    return () => {
      if (splashTimer) clearTimeout(splashTimer);
    };
  }, [order, isLoading, showSuccessSplash, token]);

  const fromTelegram = searchParams?.get('telegram') === 'true';

  // Handle Telegram Wait Popup
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (order && !isLoading && !showSuccessSplash && fromTelegram && !telegramPopupShown.current) {
      telegramPopupShown.current = true;
      if (order.status !== 'COMPLETED') {
        timer = setTimeout(() => {
          setShowTelegramWaitPopup(true);
        }, 800);
      }
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [order, isLoading, showSuccessSplash, fromTelegram]);



  // Handle PDF Print Auto-Trigger
  useEffect(() => {
    if (order && !isLoading && searchParams?.get('print') === 'true') {
      // Small delay to ensure images/fonts are fully loaded
      const printTimer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(printTimer);
    }
    return undefined;
  }, [order, isLoading, searchParams]);

  if (isLoading) {
    return (
      <div className="min-h-screen relative bg-white">
        <ConfirmationLoader
          title={t("confirmation.loadingOrder")}
          description={t("confirmation.fetchingDetails")}
          fullScreen={true}
        />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-background-sunken)] p-6 text-center">
        <p className="text-zinc-500 font-medium">{t("confirmation.orderNotFound")}</p>
        <button onClick={() => router.back()} className="mt-4 text-primary font-medium">{t("common.goBack")}</button>
      </div>
    );
  }

  const handleContinueToShop = () => {
    if (qr) router.push(`${base}/${order.tenant.slug}${query}`);
    else router.push(`${base}/${order.tenant.slug}`);
  };

  const statuses = [
    { key: "SUBMITTED", label: "Order placed", icon: Package },
    { key: "PREPARING", label: "Preparing meal", icon: Navigation2 },
    { key: "READY", label: "Ready to serve", icon: MapPin }
  ];
  let currentStatusIndex = statuses.findIndex(s => s.key === order.status);
  if (order.status === "COMPLETED") {
    currentStatusIndex = 2; // Keep all 3 steps active when completed
  }

  const StepperContent = () => {
    const formatTime = (dateStr?: string | null) => {
      if (!dateStr) return '';
      return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };

    const statusMessages = [
      { key: "SUBMITTED", title: (order.version && order.version > 1) ? t("order.statusPlaced") : t("order.statusPlaced"), desc: (order.version && order.version > 1) ? t("order.statusPlacedDesc") : t("order.statusPlacedDesc") },
      { key: "PREPARING", title: t("order.statusProcessed"), desc: t("order.statusProcessedDesc") },
      { key: "READY", title: t("order.statusReady"), desc: t("order.statusReadyDesc").replace("{0}", `#${order.orderNumber}`).replace("{1}", locale === 'km' ? (tenantInfo.nameKm || order.tenant.name) : (tenantInfo.nameEn || order.tenant.name)) }
    ];

    return (
      <div className="flex flex-col relative px-2 py-4">
        {statuses.map((step: any, idx: number) => {
          const isActive = idx <= currentStatusIndex;
          const isLastActive = idx === currentStatusIndex;
          const stepInfo = statusMessages[idx];

          let timeStr = '';
          if (idx === 0) timeStr = formatTime(order.submittedAt || order.createdAt);
          if (idx === 1 && currentStatusIndex >= 1) timeStr = formatTime(order.preparingAt || order.updatedAt);
          if (idx === 2 && currentStatusIndex >= 2) timeStr = formatTime(order.readyAt || order.completedAt || order.updatedAt);

          return (
            <div key={step.key} className="relative flex gap-4 min-h-[100px]">

              {/* Stepper Node & Line */}
              <div className="flex flex-col items-center ml-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${isActive ? 'text-[#95D829] bg-white' : 'bg-zinc-100'}`}>
                  {isActive && <CheckCircle2 size={24} className="fill-[#95D829] text-white" strokeWidth={2} />}
                </div>
                {idx < statuses.length - 1 && (
                  <div className={`w-[2px] flex-1 my-1 border-l-2 border-dashed ${idx < currentStatusIndex ? 'border-[#95D829]' : 'border-zinc-200'}`} />
                )}
              </div>

              {/* Text Content */}
              <div className="flex flex-1 gap-4 pb-8 -mt-1 ml-2">

                {/* Content */}
                <div className="flex-1">
                  <h4 className={`text-[15px] font-bold ${isActive ? 'text-zinc-800' : 'text-zinc-400'}`}>{stepInfo.title}</h4>
                  <p className={`text-[13px] mt-0.5 leading-relaxed ${isActive ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {stepInfo.desc}
                  </p>
                </div>

                {/* Time */}
                <div className="text-right shrink-0">
                  <span className={`text-[13px] font-medium ${isActive ? 'text-zinc-600' : 'text-zinc-400'}`}>{timeStr}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-zinc-50 font-sans pb-32 lg:pb-12 lg:p-12 selection:bg-primary/20">
      <div className="w-full max-w-5xl mx-auto lg:grid lg:grid-cols-[1fr_400px] gap-8 items-start">

        {/* LEFT COLUMN: Order Confirmation */}
        <div className="w-full bg-white lg:rounded-[32px] lg:shadow-xl lg:shadow-zinc-200/50 min-h-screen lg:min-h-0 relative overflow-hidden flex flex-col">

          {/* Header */}
          <div className="pt-2 px-2 lg:pt-6 lg:px-6 no-print">
            <GlassHeader
              title={t("order.detailsTitle")}
              onBack={handleContinueToShop}
              className="mx-0 w-full"
            />
          </div>

          {/* Success message and order details are handled by OrderSuccessCard */}

          {/* Tracker Stepper on Mobile (Above Invoice) */}
          <div className="lg:hidden px-6 pt-4 pb-2 no-print">
            <h3 className="text-[18px] font-bold text-zinc-900 mb-2 px-2">{t("order.statusTracker")}</h3>
            <div className="bg-white rounded-[24px] shadow-sm border border-zinc-100 p-4">
              <StepperContent />
            </div>
          </div>

          {/* Order Summary using OrderSuccessCard */}
          <section className="px-6 flex-1 pb-8 mt-2">
            {order && (() => {
              // Group items with the same properties to merge quantities
              const groupedItems = order.items.reduce((acc, item) => {
                const variantId = (item as any).variantSnapshot?.id || '';
                const optionsStr = (item as any).optionsSnapshot
                  ? JSON.stringify((item as any).optionsSnapshot.map((o: any) => o.id).sort())
                  : '';
                const notes = item.notes || '';
                const key = `${item.menuItemId}-${variantId}-${optionsStr}-${notes}`;

                if (acc[key]) {
                  acc[key].quantity += item.quantity;
                } else {
                  acc[key] = { ...item };
                }
                return acc;
              }, {} as Record<string, typeof order.items[0]>);

              const mergedItems = Object.values(groupedItems);

              return (
                <OrderSuccessCard
                  data={{
                    order_number: order.orderNumber,
                    order_time: new Date(order.createdAt).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                    restaurant_name: locale === 'km' ? (tenantInfo.nameKm || order.tenant.name) : (tenantInfo.nameEn || order.tenant.name),
                    restaurant_logo: order.tenant.logoUrl,
                    table_name: order.tableRef,
                    items: mergedItems.map(item => {
                      const vSnap = (item as any).variantSnapshot;
                      const oSnap = (item as any).optionsSnapshot;
                      const pInfo = productsMap[(item as any).menuItemId] || productsMap[(item as any).itemName] || {};

                      return {
                        item: locale === 'km'
                          ? (pInfo.nameKm || pInfo.nameEn || item.name?.km || item.name?.en || (item as any).itemName)
                          : (pInfo.nameEn || pInfo.nameKm || item.name?.en || item.name?.km || (item as any).itemName),
                        qty: item.quantity,
                        price: ((item.priceCents * item.quantity) / 100).toFixed(2),
                        variantName: vSnap ? (locale === 'km' && vSnap.nameKm ? vSnap.nameKm : (vSnap.nameEn || vSnap.variantName)) : undefined,
                        options: (oSnap ?? []).map((o: any) => ({
                          ...o,
                          name: locale === 'km' && o.nameKm ? o.nameKm : (o.nameEn || o.name)
                        })),
                        notes: (item as any).notes ?? null,
                      };
                    }),
                    customer_name: order.customerName || user?.fullName || user?.email || t("profile.guest"),
                    subtotal: (order.totalCents / 100).toFixed(2), // Simplify for now
                    total: (order.totalCents / 100).toFixed(2)
                  }}
                />
              );
            })()}
          </section>

          {/* Bottom Action (Static so it scrolls and doesn't overlap CartFooter) */}
          <div className="px-6 pb-32 lg:pb-6 flex flex-row gap-3 no-print">
            <button
              onClick={handleContinueToShop}
              className="flex-1 h-[60px] bg-white border border-zinc-200 text-zinc-700 rounded-[20px] font-medium text-[16px] active:scale-[0.98] transition-transform shadow-sm"
            >
              {t("common.goBack")}
            </button>
            {(!user && !authLoading && order) ? (
              <a
                href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || 'komorng_bot'}?start=guest_${token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 h-[60px] bg-[#2AABEE] text-white rounded-[20px] font-bold text-[16px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 shadow-lg shadow-[#2AABEE]/20"
              >
                <Send size={18} />
                {t("order.saveReceipt")}
              </a>
            ) : (
              <button
                onClick={() => handleOrderAgain(order.items)}
                disabled={isReordering}
                className="flex-1 h-[60px] bg-primary text-white rounded-[20px] font-bold text-[16px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {isReordering ? <Loader2 size={18} className="animate-spin" /> : <ShoppingBag size={18} />}
                {t("order.orderAgain")}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Desktop Tracker Stepper */}
        <div className="hidden lg:flex flex-col bg-white rounded-[32px] shadow-xl shadow-zinc-200/50 p-8 sticky top-12 no-print">
          <StepperContent />
        </div>
      </div>

      {/* ── Order Success Splash Screen ── */}
      <AnimatePresence>
        {showSuccessSplash && order && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 bg-white z-[150] flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
              className="w-28 h-28 rounded-full border-[5px] border-primary flex items-center justify-center text-primary mb-8 bg-primary/5"
            >
              <motion.svg
                xmlns="http://www.w3.org/2000/svg"
                width="56"
                height="56"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                  d="M4 12L9 17L20 6"
                />
              </motion.svg>
            </motion.div>
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-[32px] font-bold text-zinc-900 mb-3"
            >
              {t("order.successful")}
            </motion.h2>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-base text-zinc-500 font-medium max-w-[250px]"
            >
              {t("order.kitchenDesc")}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile Track Order Bottom Sheet ── */}
      <AnimatePresence>
        {showTrackerMobile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTrackerMobile(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] lg:hidden"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto bg-white rounded-t-[32px] p-6 z-[101] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] pb-12 lg:hidden"
            >
              <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto mb-6" />
              <button onClick={() => setShowTrackerMobile(false)} className="absolute top-6 right-6 text-zinc-400 bg-zinc-100 rounded-full p-1 active:scale-90 transition-transform">
                <X size={20} />
              </button>

              <h3 className="text-[20px] font-medium text-zinc-900 mb-8 px-2">{t("order.trackingDetails")}</h3>

              <StepperContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>



      <AnimatePresence>
        {showTelegramWaitPopup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTelegramWaitPopup(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto bg-white rounded-t-[32px] p-6 z-[101] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] pb-12"
            >
              <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto mb-6" />

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-4">
                  <ChefHat size={32} strokeWidth={2} />
                </div>
                <h3 className="text-[20px] font-medium text-zinc-900 mb-2">{t("order.notCompletedYet")}</h3>
                <p className="text-[14px] text-zinc-500 mb-8 leading-relaxed px-4">
                  {t("order.waitProcessingDescription")}
                </p>

                <div className="flex flex-col gap-3 w-full">
                  <button
                    onClick={() => setShowTelegramWaitPopup(false)}
                    className="w-full h-[54px] rounded-2xl bg-primary text-white font-medium active:scale-95 transition-transform"
                  >
                    Got it, thanks!
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Footer Navigation */}
      <div className="no-print">
        <CartFooter tenantSlug={order?.tenant?.slug} />
      </div>
    </main>
  );
}
