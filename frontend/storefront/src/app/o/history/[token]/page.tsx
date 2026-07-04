"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "@/providers/locale-provider";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, MapPin, Search } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import Image from "next/image";
import { getStorefrontOrderStatus, getStorefrontContext } from "@/lib/api/storefront";
import type { StorefrontOrderStatusResponse } from "@xfos/contracts-bff-storefront";
import { useOrderAgain } from "@/features/orders";
import { useQrSessionContext } from "@/providers/qr-session-provider";

export default function HistoricalOrderDetailPage() {
  const router = useRouter();
  const { qrToken } = useQrSessionContext();
  const { token } = useParams() as { token: string };
  const { locale } = useLocale();
  const { t } = useTranslation();
  const base = ``;
  const qr = qrToken ?? "";

  const [order, setOrder] = useState<StorefrontOrderStatusResponse | null>(null);
  const [tenantNameKm, setTenantNameKm] = useState<string | null>(null);
  const [tenantNameEn, setTenantNameEn] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const { handleOrderAgain, isReordering } = useOrderAgain();

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const orderData = await getStorefrontOrderStatus(token);
        if (!mounted) return;
        setOrder(orderData);
        
        // Fetch full context for localized tenant names
        if (orderData.tenant?.slug) {
          try {
            const contextData = await getStorefrontContext(orderData.tenant.slug);
            if (mounted && contextData?.tenant?.name) {
              const nameObj = contextData.tenant.name as any;
              if (typeof nameObj === 'object') {
                setTenantNameKm(nameObj.km || nameObj.en || orderData.tenant.name);
                setTenantNameEn(nameObj.en || nameObj.km || orderData.tenant.name);
              }
            }
          } catch (ctxErr) {
            console.error("Failed to load storefront context for tenant name", ctxErr);
          }
        }
        
        setIsLoading(false);
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-6 text-center">
        <p className="text-zinc-500 font-medium">{t("orderHistory.error", "Order not found or an error occurred.")}</p>
        <button onClick={() => router.back()} className="mt-4 text-primary font-medium">{t("common.goBack", "Go Back")}</button>
      </div>
    );
  }

  // Merge items
  const groupedItems = order.items.reduce((acc, item) => {
    const variantId = (item as any).variantSnapshot?.id || '';
    const optionsStr = (item as any).optionsSnapshot 
      ? JSON.stringify((item as any).optionsSnapshot.map((o: any) => o.id).sort()) 
      : '';
    const notes = item.notes || '';
    const key = `${item.name.en}-${variantId}-${optionsStr}-${notes}`;

    if (acc[key]) {
      acc[key].quantity += item.quantity;
    } else {
      acc[key] = { ...item };
    }
    return acc;
  }, {} as Record<string, typeof order.items[0]>);

  const mergedItems = Object.values(groupedItems);

  // Status mapping
  const statusLabels: Record<string, string> = {
    'COMPLETED': t("order.completed", "Completed"),
    'CANCELLED': t("order.cancelled", "Cancelled"),
    'NEW': t("order.placed", "Submitted"),
    'PREPARING': t("order.preparing", "Preparing"),
    'READY': t("order.ready", "Ready"),
  };
  
  const statusLabel = statusLabels[order.status] || order.status;
  const isCancelled = order.status === 'CANCELLED';

  return (
    <main className="min-h-screen bg-zinc-50 font-sans pb-32 selection:bg-primary/20 relative">
      
      {/* ── Background Hero Header ── */}
      <div className="absolute top-0 left-0 right-0 h-[240px] bg-primary rounded-b-[48px] z-0" />

      {/* ── Header Content ── */}
      <div className="relative z-10 px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform border border-white/20"
          >
            <ArrowLeft size={20} />
          </button>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/70 text-[13px] font-medium mb-1">{t("invoice.orderNo", "Order No.")}</p>
            <h1 className="text-white text-[32px] font-black tracking-tighter leading-none">
              {order.orderNumber}
            </h1>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-[13px] font-bold ${isCancelled ? 'bg-white/20 text-white backdrop-blur-md' : 'bg-white text-primary'} border border-white/20`}>
            {statusLabel}
          </div>
        </div>
      </div>

      {/* ── Main Overlapping Card ── */}
      <div className="relative z-20 px-4 sm:px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[32px] p-6 border border-zinc-200 mb-6"
        >
          {/* Restaurant / Location Info */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-[16px] bg-primary/5 flex items-center justify-center overflow-hidden shrink-0 border border-primary/10">
              {order.tenant.logoUrl ? (
                <Image src={order.tenant.logoUrl} alt={order.tenant.name} width={56} height={56} className="object-cover" />
              ) : (
                <span className="text-xl font-black text-primary">
                  {(() => {
                    const tName = locale === 'km' ? (tenantNameKm || order.tenant.name) : (tenantNameEn || order.tenant.name);
                    const parts = tName.split(' / ');
                    return (locale === 'km' ? (parts[0] || tName) : (parts[1] || tName)).charAt(0);
                  })()}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-zinc-900 mb-1">
                {(() => {
                  const tName = locale === 'km' ? (tenantNameKm || order.tenant.name) : (tenantNameEn || order.tenant.name);
                  const parts = tName.split(' / ');
                  return locale === 'km' ? (parts[0] || tName) : (parts[1] || tName);
                })()}
              </h2>
              <div className="flex items-center gap-1.5 text-zinc-500 text-[13px]">
                <MapPin size={14} className="text-primary/70" />
                <span>{order.tableRef || t("invoice.table", "Table")}</span>
                <span className="mx-1">•</span>
                <span>{new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} • {new Date(order.createdAt).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-zinc-100 mb-6" />

          {/* Items List */}
          <div className="mb-6">
            <div className="border border-zinc-200 rounded-[16px] overflow-hidden">
              {/* Header */}
              <div className="flex items-center px-4 py-3 bg-zinc-50/80 border-b border-zinc-200 text-[12px] font-medium text-zinc-500">
                <div className="w-10">{t("invoice.no", "No.")}</div>
                <div className="flex-1">{t("invoice.itemName", "Item Name")}</div>
                <div className="w-12 text-center">{t("invoice.qty", "Qty")}</div>
                <div className="w-16 text-right">{t("invoice.price", "Price")}</div>
              </div>
              
              {/* Rows */}
              <div className="divide-y divide-zinc-100">
                {mergedItems.map((item, idx) => (
                  <div key={idx} className="flex items-start px-4 py-4 bg-white hover:bg-zinc-50/50 transition-colors">
                    <div className="w-10 pt-0.5 text-[14px] font-bold text-zinc-400">
                      {idx + 1}
                    </div>
                    <div className="flex-1 pr-3">
                      <p className="text-[14px] font-bold text-zinc-800 leading-snug">
                        {(() => {
                          const rawName = (item.name as any)?.km || (item.name as any)?.en || item.name || '';
                          const nameStr = typeof rawName === 'string' ? rawName : '';
                          const nameParts = nameStr.split(' / ');
                          const nameKm = nameParts[0] || nameStr;
                          const nameEn = nameParts[1] || nameStr;
                          return locale === 'km' ? nameKm : nameEn;
                        })()}
                      </p>
                      
                      {/* Variant & Options */}
                      {((item as any).variantSnapshot?.name || ((item as any).optionsSnapshot && (item as any).optionsSnapshot.length > 0) || item.notes) && (
                        <div className="text-[12px] text-zinc-500 mt-1.5 space-y-0.5">
                          {(item as any).variantSnapshot?.name && (
                            <p>{t("common.size", "Size")}: {(item as any).variantSnapshot.name}</p>
                          )}
                          {(item as any).optionsSnapshot?.map((opt: any, i: number) => (
                            <p key={i}>+ {opt.name}</p>
                          ))}
                          {item.notes && (
                            <p className="text-primary mt-1 italic">{t("invoice.note", "Note")}: "{item.notes}"</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="w-12 text-center pt-0.5 text-[14px] font-bold text-zinc-600">
                      x{item.quantity}
                    </div>
                    <div className="w-16 text-right pt-0.5 text-[14px] font-black text-zinc-900">
                      ${((item.priceCents * item.quantity) / 100).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="space-y-3">
            <div className="pt-4 mt-2 border-t-2 border-dashed border-zinc-100 flex justify-end items-baseline gap-4">
              <span className="text-[17px] font-bold text-zinc-900">{t("invoice.grandTotal", "Total")}</span>
              <span className="text-[22px] font-black text-primary w-24 text-right">${(order.totalCents / 100).toFixed(2)}</span>
            </div>
          </div>

        </motion.div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button 
            onClick={() => handleOrderAgain(order.items)}
            disabled={isReordering}
            className="flex-1 h-14 bg-primary text-white rounded-[20px] font-bold text-[16px] flex items-center justify-center gap-2 active:scale-95 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {isReordering ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                <span>{t("order.orderAgain", "Order Again")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
