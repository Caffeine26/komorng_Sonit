"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, UtensilsCrossed, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { OrderCard } from "@/features/order-management";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  getAdminOrdersList,
  patchAdminOrderStatus,
  acknowledgeAdminOrderNewItems,
} from "@/lib/api/order";

import { Loader2 } from "lucide-react";

// ── TYPES ──────────────────────────────────────────────────────────────────
interface OrderItem {
  id: string;
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  variantSnapshot?: { variantId?: string; variantName?: string } | null;
  optionsSnapshot?: { groupId: string; optionId: string; name: string; priceDeltaCents: number }[] | null;
  notes?: string | null;
  isNewlyAdded?: boolean;
  itemStatus?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  tableId: string;
  tableRef?: string | null;
  tableName?: string;
  tableImage?: string;
  serviceModel?: string | null;
  customerName: string;
  status: "SUBMITTED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
  orderToken?: string | null;
  items: OrderItem[];
  totalCents: number;
  createdAt: string;
  needsAttention?: boolean;
  isTakeaway?: boolean;
}
import { useTenant } from "@/features/tenant/providers/TenantProvider";

// ── INVOICE TICKET ──────────────────────────────────────────────────────────
const OrderDetailTicket = ({
  order,
  onClose,
  isMobile,
}: {
  order: Order;
  onClose: () => void;
  isMobile?: boolean;
}) => {
  const t = useTranslations("orders");
  const commonT = useTranslations("common");
  const { tenant } = useTenant();
  const total = order.totalCents / 100;

  const handleDownloadPdf = () => {
    if (!order.orderToken) {
      alert("Error: Order token is missing. Cannot generate PDF.");
      return;
    }
    // Check path or default to km
    const lang = window.location.pathname.includes('/en') ? 'en' : 'km';
    const pdfUrl = `/api/v1/storefront/orders/${order.orderToken}/pdf?lang=${lang}`;
    window.open(pdfUrl, '_blank');
  };

  const statusBadgeColor =
    order.status === "COMPLETED"
      ? "bg-emerald-500"
      : order.status === "CANCELLED"
      ? "bg-rose-500"
      : order.status === "READY"
      ? "bg-blue-500"
      : order.status === "PREPARING"
      ? "bg-amber-500"
      : "bg-zinc-400";

  return (
    <div
      className={cn(
        "bg-white rounded-[16px] border border-[var(--color-border,#e4e4e7)] shadow-sm p-6 space-y-5 font-sans relative overflow-hidden",
        isMobile ? "border-none shadow-none rounded-none p-4" : ""
      )}
    >
      {/* ── TOP HEADER (Brand/Title) ── */}
      <div className="flex flex-col items-center relative">
        {tenant?.settings?.logoUrl ? (
          <div className="relative w-14 h-14 mb-3 rounded-[16px] overflow-hidden border border-zinc-100 shadow-md">
            <img src={tenant.settings.logoUrl} alt={tenant.name || "Tenant"} className="object-contain w-full h-full bg-white p-1" />
          </div>
        ) : (
          <div className="w-14 h-14 mb-3 bg-primary/5 rounded-[16px] flex items-center justify-center shadow-lg shadow-primary/20 text-primary">
            <UtensilsCrossed size={28} strokeWidth={2.5} />
          </div>
        )}
        <h2 className="text-[18px] font-extrabold text-[var(--color-foreground,#18181b)] tracking-tight">
          {tenant?.name || "Restaurant"}
        </h2>
        <p className="text-[14px] font-medium text-[var(--color-muted,#71717a)] mt-1">{t("receipt_summary")}</p>
        {!isMobile && (
          <button
            onClick={onClose}
            className="absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center bg-zinc-50 text-[var(--color-muted,#71717a)] hover:bg-zinc-100 transition-all cursor-pointer"
          >
            <Plus size={16} className="rotate-45" />
          </button>
        )}
      </div>

      {/* ── METADATA GRID (Clean Vibe) ── */}
      <div className="grid grid-cols-2 gap-y-4 gap-x-6 border-t border-zinc-100 pt-5">
        <div>
          <label className="block text-[12px] font-bold text-zinc-900 mb-1">{commonT("invoice_no")}</label>
          <span className="text-[14px] font-medium text-zinc-900">{order.orderNumber}</span>
        </div>
        <div>
          <label className="block text-[12px] font-bold text-zinc-900 mb-1">{commonT("time")}</label>
          <span className="text-[14px] font-medium text-zinc-900">
            {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div>
          <label className="block text-[12px] font-bold text-zinc-900 mb-1">{t("table")}</label>
          <span className="text-[14px] font-medium text-zinc-900">
            {order.isTakeaway || (order.serviceModel && order.serviceModel !== 'DINE_IN_TABLE') 
              ? t("takeaway") 
              : order.tableName || order.tableRef || order.tableId || t("takeaway")}
          </span>
        </div>
        <div>
          <label className="block text-[12px] font-bold text-zinc-900 mb-1">{commonT("status")}</label>
          <span className={cn("px-2 py-0.5 text-white rounded-lg text-[10px] font-bold tracking-tight uppercase", statusBadgeColor)}>
            {order.status}
          </span>
        </div>
      </div>

      {/* ── ITEMS TABLE (Clean Vibe) ── */}
      <div className="overflow-hidden rounded-[12px] border border-zinc-900/10 mt-6">
        <table className="w-full text-[14px]">
          <thead className="bg-white">
            <tr className="border-b border-zinc-900/10">
              <th className="px-4 py-3 text-left font-bold text-zinc-900 text-[12px]">{t("item")}</th>
              <th className="px-3 py-3 text-center font-bold text-zinc-900 text-[12px]">{t("qty")}</th>
              <th className="px-4 py-3 text-right font-bold text-zinc-900 text-[12px]">{t("price")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/10">
            {order.items.map((item, i) => {
              const lineTotal = (item.unitPriceCents * item.quantity) / 100;
              return (
                <tr key={item.id || i} className="text-zinc-900 hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-3.5 text-left">
                    <div className="font-medium leading-tight">{item.itemName}</div>
                    {item.variantSnapshot?.variantName && (
                      <div className="text-[11px] font-medium text-primary/80 mt-0.5">▸ {item.variantSnapshot.variantName}</div>
                    )}
                    {item.optionsSnapshot && item.optionsSnapshot.length > 0 && (
                      <div className="flex flex-col mt-0.5">
                        {item.optionsSnapshot.map((opt, j) => (
                          <span key={j} className="text-[11px] text-zinc-500">+ {opt.name}{opt.priceDeltaCents > 0 && <span className="text-zinc-400 ml-1">(+${(opt.priceDeltaCents / 100).toFixed(2)})</span>}</span>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-[11px] font-medium text-primary/80 mt-0.5 italic line-clamp-1">{t("note")}: {item.notes}</div>
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-center font-medium text-zinc-400">x{item.quantity}</td>
                  <td className="px-4 py-3.5 text-right font-bold">${lineTotal.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── FOOTER: Subtotal & Grand Total card ── */}
      <div className="flex flex-col space-y-5 pt-5 border-t border-dashed border-zinc-200">
        <div className="flex justify-end w-full">
          <div className="flex justify-between w-full max-w-[200px] items-center">
            <label className="text-[13px] font-bold text-zinc-900">{t("subtotal")}</label>
            <span className="text-[15px] font-bold text-zinc-900 tabular-nums">${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Grand Total Card (Clean Vibe) */}
          <div className="bg-white p-5 rounded-[14px] border border-zinc-900/10 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[16px] font-bold text-zinc-900 tracking-tight">{t("grand_total")}</span>
            <span className="text-[24px] font-bold text-primary tabular-nums tracking-tighter">${total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] font-medium text-zinc-400 italic">{t("exchange_rate")}</span>
            <span className="text-[15px] font-bold text-zinc-500 tabular-nums">៛{(total * 4000).toLocaleString()}</span>
          </div>
          </div>
      </div>

      {/* ACTION */}
      <div className="pt-2">
        <button 
          onClick={handleDownloadPdf}
          className="w-full h-12 bg-rose-600 text-white rounded-xl flex items-center justify-center gap-2 text-[14px] font-bold hover:bg-rose-700 active:scale-[0.98] transition-all cursor-pointer"
        >
          {t("download_pdf")}
        </button>
      </div>
    </div>
  );
};

// ── PAGE ───────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const t = useTranslations("orders");
  const commonT = useTranslations("common");
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;

  const [orders, setOrders] = useState<Order[]>([]);
  // initialLoading: true only on first mount → shows the full-page spinner
  const [initialLoading, setInitialLoading] = useState(true);
  // isSyncing: true during background refreshes → shows the tiny RotateCw spin only
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<Order["status"] | "ALL">("SUBMITTED");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const prevSnapshotRef = useRef<Record<string, number>>({});

  const mapApiOrder = (apiOrder: any): Order => ({
    id: apiOrder.orderId,
    orderNumber: apiOrder.orderNumber,
    orderToken: apiOrder.orderToken ?? null,
    // tableRef is the human-readable label (e.g. "table 4") from backend
    tableRef: apiOrder.tableRef ?? null,
    // tableId keeps backward compat for the detail ticket
    tableId: apiOrder.tableId || "",
    tableImage: apiOrder.tableImage ?? undefined,
    serviceModel: apiOrder.serviceModel ?? null,
    customerName: apiOrder.customerName || "Walk-in",
    status: apiOrder.status,
    createdAt: apiOrder.createdAt,
    totalCents: apiOrder.totalCents,
    items: (apiOrder.items || []).map((item: any) => ({
      id: item.id || Math.random().toString(),
      itemName: item.itemName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      variantSnapshot: item.variantSnapshot ?? null,
      optionsSnapshot: item.optionsSnapshot ?? null,
      notes: item.notes ?? null,
      isNewlyAdded: item.isNewlyAdded ?? false,
      itemStatus: item.itemStatus ?? "SUBMITTED",
    })),
    needsAttention: apiOrder.needsAttention ?? false,
  });

  /**
   * silent=true  → background refresh (no full-page spinner, only RotateCw icon spins)
   * silent=false → initial load (shows full-page spinner)
   */
  const fetchOrders = useCallback(async (silent = false) => {
    if (silent) {
      setIsSyncing(true);
    } else {
      setInitialLoading(true);
    }
    try {
      const data = await getAdminOrdersList(tenantSlug);
      const mapped = data.map(mapApiOrder);
      setOrders(mapped);
      const attentionOrders = mapped.filter((o) => o.needsAttention);
      const newOrders = mapped.filter(
        (o) => o.status === "SUBMITTED" && !o.needsAttention,
      );

      let newItemDelta = 0;
      for (const o of attentionOrders) {
        const newCount = o.items.filter((i) => i.isNewlyAdded).length;
        const prev = prevSnapshotRef.current[o.id] ?? 0;
        if (newCount > prev) {
          newItemDelta += newCount - prev;
        }
        prevSnapshotRef.current[o.id] = newCount;
      }

      for (const o of mapped) {
        if (!o.needsAttention) {
          prevSnapshotRef.current[o.id] = 0;
        }
      }

      if (newItemDelta > 0) {
        const label =
          attentionOrders.find((o) => o.needsAttention)?.tableRef ||
          attentionOrders.find((o) => o.needsAttention)?.tableId ||
          "Table";
        setToastMessage(`${label} added ${newItemDelta} new item(s)`);
        setTimeout(() => setToastMessage(null), 5000);
      }
      prevSnapshotRef.current.__newOrdersCount = newOrders.length;

      const newItemsBellCount = attentionOrders.reduce(
        (sum, o) => sum + o.items.filter((i) => i.isNewlyAdded).length,
        0,
      );

      window.dispatchEvent(
        new CustomEvent("orders-attention-update", {
          detail: {
            count: newItemsBellCount,
            orders: attentionOrders,
            newOrdersCount: newOrders.length,
            newOrders,
          },
        }),
      );

      // Keep the selected order detail in sync with latest data
      setSelectedOrder((prev) =>
        prev ? (mapped.find((o) => o.id === prev.id) ?? null) : null
      );
    } catch (e) {
      console.error("Failed to fetch orders:", e);
    } finally {
      setInitialLoading(false);
      setIsSyncing(false);
    }
  }, [tenantSlug]);

// Update order status helper
const updateOrderStatus = async (orderId: string, newStatus: string) => {
  try {
    await patchAdminOrderStatus(orderId, { status: newStatus }, tenantSlug);
    // Refresh orders silently to reflect changes
    await fetchOrders(true);
  } catch (error) {
    console.error('Failed to update order status', error);
  }
};

  // Initial load on mount
  useEffect(() => {
    fetchOrders(false);
  }, [fetchOrders]);

  // Silent background auto-refresh every 30 seconds
  // Does NOT cause a loading spinner — UI stays stable
  useEffect(() => {
    const interval = setInterval(() => fetchOrders(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleAcknowledgeAdditions = async (orderId: string) => {
    const prevOrders = orders;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              needsAttention: false,
              items: o.items.map((item) => ({ ...item, isNewlyAdded: false })),
            }
          : o,
      ),
    );
    prevSnapshotRef.current[orderId] = 0;
    try {
      await acknowledgeAdminOrderNewItems(orderId, tenantSlug);
      await fetchOrders(true);
    } catch (e) {
      console.error("Failed to acknowledge additions:", e);
      setOrders(prevOrders);
    }
  };



  const filteredOrders = orders.filter((o) => {
    const matchesTab = activeTab === "ALL" || o.status === activeTab;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      o.tableId.toLowerCase().includes(q) ||
      o.items.some((item) => item.itemName.toLowerCase().includes(q));
    return matchesTab && matchesSearch;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    // 1. Elevate needsAttention to the top
    if (a.needsAttention && !b.needsAttention) return -1;
    if (!a.needsAttention && b.needsAttention) return 1;
    // 2. Normal sorting (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const tabs: { id: Order["status"] | "ALL"; label: string }[] = [
    { id: "SUBMITTED", label: t("submitted") },
    { id: "PREPARING", label: t("preparing") },
    { id: "READY", label: t("ready") },
    { id: "COMPLETED", label: t("completed") },
    { id: "CANCELLED", label: t("cancelled") },
    { id: "ALL", label: t("all_orders") },
  ];

  return (
    <div className="min-h-screen bg-zinc-50/10 flex flex-col animate-ui-entry relative">
      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] px-4 py-3 rounded-xl bg-zinc-900 text-white text-sm font-medium shadow-lg">
          {toastMessage}
        </div>
      )}
      {/* TOP BAR */}
      <header className="py-3 sm:py-4 px-4 md:px-8 lg:px-10 flex flex-col lg:flex-row lg:items-center gap-4 justify-between flex-shrink-0 relative z-50">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 flex-1 w-full max-w-3xl">
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-950/60" />
            <input
              type="text"
              placeholder={commonT("search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 sm:h-12 pl-12 pr-6 bg-white/60 border border-zinc-100 rounded-xl text-[13px] sm:text-[14px] font-normal text-zinc-950 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/10 transition-all placeholder:text-zinc-950/40"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto justify-end sm:justify-start lg:justify-end">
          <button
            onClick={() => fetchOrders(true)}
            className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 bg-white border border-zinc-100 rounded-xl flex items-center justify-center text-zinc-950 hover:bg-zinc-50 transition-all cursor-pointer shadow-sm"
          >
            <RotateCw
              size={18}
              className={cn("text-zinc-950", isSyncing && "animate-spin text-zinc-400")}
            />
          </button>
        </div>
      </header>

      {/* TABS */}
      <div className="px-4 md:px-8 lg:px-10 py-1 border-b border-zinc-100 bg-white/40 backdrop-blur-sm sticky top-0 z-[40] overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "h-10 px-6 rounded-full text-[13px] font-normal transition-all whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "ml-2 text-[10px] px-1.5 py-0.5 rounded-md",
                  activeTab === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-zinc-100 text-zinc-400"
                )}
              >
                {tab.id === "ALL"
                  ? orders.length
                  : orders.filter((o) => o.status === tab.id).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <div className="flex flex-col lg:flex-row flex-1 items-start w-full relative">
        <main className="flex-1 w-full p-4 md:p-6 lg:p-8 pb-24 flex flex-col min-h-[calc(100vh-96px)]">
          {initialLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-primary w-8 h-8" />
            </div>
          ) : sortedOrders.length > 0 ? (
            <div
              className={cn(
                "grid gap-4 md:gap-6 lg:gap-8 transition-all duration-500",
                selectedOrder
                  ? "grid-cols-1 xl:grid-cols-2"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              )}
            >
              {sortedOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order as any}
                  isSelected={selectedOrder?.id === order.id}
                  onClick={() =>
                    setSelectedOrder((prev) =>
                      prev?.id === order.id ? null : order
                    )
                  }
                  onUpdateStatus={updateOrderStatus}
                  onAcknowledgeAdditions={handleAcknowledgeAdditions}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-zinc-950/40 gap-3">
              <div className="w-16 h-16 rounded-full bg-zinc-50 flex items-center justify-center mb-2">
                <UtensilsCrossed size={24} className="text-zinc-950/20" />
              </div>
              <p className="text-[14px] font-normal tracking-tight">{t("no_orders")}</p>
            </div>
          )}
        </main>

        {/* ORDER DETAIL INVOICE */}
        {selectedOrder && (
          <>
            {/* Desktop Sidebar */}
            <aside className="hidden lg:block w-[380px] xl:w-[420px] sticky top-8 self-start px-4 pb-20 animate-ui-entry shrink-0">
              <OrderDetailTicket
                order={selectedOrder}
                onClose={() => setSelectedOrder(null)}
              />
            </aside>

            {/* Mobile Bottom Sheet */}
            <div className="lg:hidden fixed inset-0 z-[100] flex flex-col justify-end">
              <div
                className="absolute inset-0 bg-zinc-950/20 backdrop-blur-sm"
                onClick={() => setSelectedOrder(null)}
              />
              <div className="relative w-full bg-white rounded-t-[40px] shadow-[0_-20px_60px_rgba(0,0,0,0.1)] animate-in slide-in-from-bottom duration-500 max-h-[90vh] overflow-hidden flex flex-col">
                <div className="h-1.5 w-12 bg-zinc-200 rounded-full mx-auto my-4 shrink-0" />
                <div className="overflow-y-auto no-scrollbar flex-1 pb-10 px-4">
                  <OrderDetailTicket
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    isMobile
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
