"use client";

import React from "react";
import { Clock, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog";
import { useTranslations, useLocale } from "next-intl";
import { useTenant } from "@/features/tenant/providers/TenantProvider";


// ── Real API types (mirroring ListOrdersItem from the contract) ────────────
export interface ApiOrderItem {
  id?: string;
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  variantSnapshot?: { variantId?: string; variantName?: string } | null;
  optionsSnapshot?: { groupId: string; optionId: string; name: string; priceDeltaCents: number }[] | null;
  notes?: string | null;
  isNewlyAdded?: boolean;
  itemStatus?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  /** Raw tableRef string — human-readable label e.g. "table 4" */
  tableRef?: string | null;
  /** tableId from backend */
  tableId?: string | null;
  /** serviceModel: DINE_IN_TABLE | STALL_KIOSK */
  serviceModel?: string | null;
  status: "SUBMITTED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
  totalCents: number;
  createdAt: string;
  items: ApiOrderItem[];
  /** Legacy fields kept for backward compat */
  isTakeaway?: boolean;
  tableName?: string;
  tableImage?: string;
  customerName?: string;
  needsAttention?: boolean;
}

interface OrderCardProps {
  order: Order;
  isSelected?: boolean;
  onClick?: () => void;
  onUpdateStatus?: (id: string, newStatus: string) => void;
  onAcknowledgeAdditions?: (orderId: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  SUBMITTED:       "bg-blue-50 text-blue-600 border-blue-100/50",
  PREPARING:       "bg-[#E91E63]/5 text-[#E91E63] border-[#E91E63]/10",
  READY:           "bg-purple-50 text-purple-600 border-purple-100/50",
  COMPLETED:       "bg-emerald-50 text-emerald-600 border-emerald-100/50",
  CANCELLED:       "bg-rose-50 text-rose-600 border-rose-100/50",
  PENDING_PAYMENT: "bg-amber-50 text-amber-600 border-amber-100/50",
};

const NEXT_STATUS: Record<string, string> = {
  PENDING_PAYMENT: "SUBMITTED",
  SUBMITTED:       "PREPARING",
  PREPARING:       "READY",
  READY:           "COMPLETED",
  COMPLETED:       "COMPLETED",
  CANCELLED:       "CANCELLED",
};

/** Extract a human-readable table label from tableRef */
function resolveTableLabel(order: Order): string | null {
  if (order.isTakeaway) return null;
  if (order.tableName) return order.tableName;
  // tableRef is now stored directly as the table label from the backend
  if (order.tableRef) return order.tableRef;
  if (order.tableId) return order.tableId;
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────
export const OrderCard = ({
  order,
  isSelected,
  onClick,
  onUpdateStatus,
  onAcknowledgeAdditions,
}: OrderCardProps) => {
  const t = useTranslations("orders");
  const commonT = useTranslations("common");
  const { tenant } = useTenant();
  const locale = useLocale();

  const [showRejectConfirm, setShowRejectConfirm] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const tableLabel = resolveTableLabel(order);
  // isTakeaway = true only if serviceModel is NOT DINE_IN_TABLE and no table label found
  const isTakeaway = order.isTakeaway ||
    (order.serviceModel ? order.serviceModel !== 'DINE_IN_TABLE' : !tableLabel);
  const isTerminal = order.status === "CANCELLED" || order.status === "COMPLETED";

  const timeStr = new Date(order.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = (() => {
    const d = new Date(order.createdAt);
    const today = new Date();
    return d.toDateString() === today.toDateString()
      ? t("today")
      : d.toLocaleDateString();
  })();

  const getButtonLabel = (status: string) => {
    switch (status) {
      case "PENDING_PAYMENT": return t("confirm_order");
      case "SUBMITTED":       return t("confirm_order");
      case "PREPARING":       return t("mark_as_ready");
      case "READY":           return t("complete_order");
      case "COMPLETED":       return t("pay_bill");
      default:                return commonT("update");
    }
  };

  const handleUpdate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Attempting status update for order', order.id, 'from', order.status, 'to', NEXT_STATUS[order.status]);
    setIsUpdating(true);
    try {
      await onUpdateStatus?.(order.id, NEXT_STATUS[order.status] ?? order.status);
    } catch (err) {
      console.error('Status update failed', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRejectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRejectConfirm(true);
  };

  const onConfirmReject = () => {
    onUpdateStatus?.(order.id, "CANCELLED");
    setShowRejectConfirm(false);
  };

  const handleAcknowledge = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (order.needsAttention) {
      onAcknowledgeAdditions?.(order.id);
    }
  };

  const currentItems = order.needsAttention 
    ? order.items.filter(item => !item.isNewlyAdded) 
    : order.items;
    
  const newItems = order.needsAttention 
    ? order.items.filter(item => item.isNewlyAdded) 
    : [];

  const [isPulsing, setIsPulsing] = React.useState(!!order.needsAttention);
  React.useEffect(() => {
    if (order.needsAttention) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 8000);
      return () => clearTimeout(timer);
    }
    setIsPulsing(false);
    return undefined;
  }, [order.needsAttention]);

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col rounded-[16px] p-6 space-y-5 transition-all duration-300 border cursor-pointer animate-ui-entry bg-white font-sans",
        isSelected
          ? "border-primary shadow-md shadow-primary/10"
          : "border-[var(--color-border,#e4e4e7)] shadow-sm hover:shadow-md"
      )}
    >
      {/* ── HEADER: Table Image & Name ── */}
      <div className="flex flex-row justify-between items-center mb-1">
        <div className="text-[18px] font-black tracking-tighter flex items-center gap-3">
          {isTakeaway ? (
            <div className="w-10 h-10 rounded-[12px] bg-primary flex items-center justify-center text-white shrink-0">
              <ShoppingBag size={20} strokeWidth={2.5} />
            </div>
          ) : order.tableImage ? (
            <div className="relative w-10 h-10 rounded-[12px] overflow-hidden border border-zinc-100 shrink-0">
              <img src={order.tableImage} alt="Table" className="object-cover w-full h-full bg-white" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-[12px] bg-primary/5 border border-primary/10 flex items-center justify-center text-[14px] font-bold text-primary shrink-0">
              {(tableLabel ?? "TB").substring(0, 2).toUpperCase()}
            </div>
          )}
          <div className="text-zinc-900 leading-none">
            {isTakeaway ? t("takeaway") : tableLabel}
          </div>
        </div>
        {/* Status badge */}
        <div
          className={cn(
            "px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-colors tracking-tight uppercase",
            STATUS_STYLES[order.status] ?? "bg-zinc-50 border-zinc-100 text-zinc-600"
          )}
        >
          {t(order.status.toLowerCase())}
        </div>
      </div>

      {/* ── METADATA GRID (Clean Vibe) ── */}
      <div className="grid grid-cols-2 gap-y-4 gap-x-6 border-t border-zinc-100 pt-4">
        <div>
          <label className="block text-[12px] font-bold text-zinc-900 mb-1">{t("order_no")}</label>
          <span className="text-[14px] font-medium text-zinc-900">#{order.orderNumber}</span>
        </div>
        <div>
          <label className="block text-[12px] font-bold text-zinc-900 mb-1">{t("order_time")}</label>
          <span className="text-[14px] font-medium text-zinc-900">
            {dateStr}, {timeStr}
          </span>
        </div>
        <div>
          <label className="block text-[12px] font-bold text-zinc-900 mb-1">{t("table")}</label>
          <span className="text-[14px] font-medium text-zinc-900 line-clamp-1">
            {isTakeaway ? t("takeaway") : tableLabel}
          </span>
        </div>
        <div>
          <label className="block text-[12px] font-bold text-zinc-900 mb-1">{t("customer")}</label>
          <span className="text-[14px] font-medium text-zinc-900 line-clamp-1">
            {order.customerName || t("guest")}
          </span>
        </div>
      </div>

      {/* ── ITEMS TABLE (Clean Vibe) ── */}
      <div className="overflow-hidden rounded-[12px] border border-zinc-900/10">
        <table className="w-full text-[14px]">
          <thead className="bg-white">
            <tr className="border-b border-zinc-900/10">
              <th className="px-4 py-3 text-left font-bold text-zinc-900 text-[12px]">{t("item_name")}</th>
              <th className="px-3 py-3 text-center font-bold text-zinc-900 text-[12px]">{t("qty")}</th>
              <th className="px-4 py-3 text-right font-bold text-zinc-900 text-[12px]">{t("price")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/10">
            {currentItems.slice(0, 4).map((item, idx) => {
              const lineTotal = (item.unitPriceCents * item.quantity) / 100;
              return (
                <tr key={item.id ?? idx} className={cn(
                  "text-zinc-900 transition-colors",
                  order.needsAttention ? "opacity-40 pointer-events-none grayscale bg-zinc-50/50" : "hover:bg-zinc-50"
                )}>
                  <td className="px-4 py-3.5">
                    <div className="font-medium leading-tight">
                      {(() => {
                        const nameParts = (item.itemName || '').split(' / ');
                        const nameKm = nameParts[0] || item.itemName;
                        const nameEn = nameParts[1] || item.itemName;
                        return locale === 'km' ? nameKm : nameEn;
                      })()}
                    </div>
                    {item.variantSnapshot?.variantName && (
                      <div className="text-[11px] font-medium text-primary/80 mt-0.5">▸ {item.variantSnapshot.variantName}</div>
                    )}
                    {item.optionsSnapshot && item.optionsSnapshot.length > 0 && (
                      <div className="flex flex-col mt-0.5">
                        {item.optionsSnapshot.map((opt, i) => (
                          <span key={i} className="text-[11px] text-zinc-500">+ {opt.name}{opt.priceDeltaCents > 0 && <span className="text-zinc-400 ml-1">(+${(opt.priceDeltaCents / 100).toFixed(2)})</span>}</span>
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
        {/* Overflow indicator inside the table border */}
        {!order.needsAttention && order.items.length > 4 && (
          <div className="flex justify-center py-2 bg-zinc-50/50 border-t border-zinc-900/10 gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-300"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-300"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-300"></div>
          </div>
        )}

        {/* ── NEWLY ADDED SECTION ── */}
        {order.needsAttention && newItems.length > 0 && (
          <div className={cn(
            "border-t border-orange-200 bg-amber-50/40 transition-colors duration-1000",
            isPulsing ? "bg-amber-100/70" : ""
          )}>

            <table className="w-full text-[14px]">
              <tbody className="divide-y divide-orange-200/50">
                {newItems.map((item, idx) => {
                  const lineTotal = (item.unitPriceCents * item.quantity) / 100;
                  return (
                    <tr key={item.id ?? idx} className="text-orange-950 hover:bg-amber-100/30 transition-colors">
                      <td className="px-4 py-3.5">
                         <div className="flex items-center gap-1.5">
                           <span className="text-orange-600 font-bold text-[12px] uppercase" aria-label="new">[NEW]</span>
                           <span className="font-medium">
                             {(() => {
                               const nameParts = (item.itemName || '').split(' / ');
                               const nameKm = nameParts[0] || item.itemName;
                               const nameEn = nameParts[1] || item.itemName;
                               return locale === 'km' ? nameKm : nameEn;
                             })()}
                           </span>
                         </div>
                        {item.variantSnapshot?.variantName && (
                          <div className="text-[11px] font-medium text-orange-800/80 mt-0.5">▸ {item.variantSnapshot.variantName}</div>
                        )}
                        {item.optionsSnapshot && item.optionsSnapshot.length > 0 && (
                          <div className="flex flex-col mt-0.5">
                            {item.optionsSnapshot.map((opt, i) => (
                              <span key={i} className="text-[11px] text-orange-700/80">+ {opt.name}{opt.priceDeltaCents > 0 && <span className="opacity-70 ml-1">(+${(opt.priceDeltaCents / 100).toFixed(2)})</span>}</span>
                            ))}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-[11px] font-bold text-orange-600 mt-0.5 italic line-clamp-1">{t("note")}: {item.notes}</div>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-center font-bold text-orange-700">x{item.quantity}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-orange-900">${lineTotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── FOOTER: Grand Total card + actions ── */}
      {!isTerminal && (
        <>
          {/* Grand Total Card (Clean Vibe) */}
          <div className="bg-white p-5 rounded-[14px] border border-zinc-900/10 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[16px] font-bold text-zinc-900 tracking-tight">{t("grand_total")}</span>
              <span className="text-[24px] font-bold text-primary tabular-nums tracking-tighter">${(order.totalCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[12px] font-medium text-zinc-400 italic">{t("exchange_rate")}</span>
              <span className="text-[15px] font-bold text-zinc-500 tabular-nums">៛{(order.totalCents / 100 * 4000).toLocaleString()}</span>
            </div>
          </div>



          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <button
              onClick={handleRejectClick}
              className="h-12 rounded-[14px] bg-white border border-rose-100 text-[13px] font-bold text-rose-500 hover:bg-rose-50 transition-all cursor-pointer"
            >
              {t("reject_order")}
            </button>
            <button
                onClick={handleUpdate}
                disabled={isUpdating}
                className={`h-12 rounded-[14px] bg-[#E91E63] text-white text-[13px] font-bold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isUpdating ? t('updating') : getButtonLabel(order.status)}
              </button>
          </div>
        </>
      )}

      {/* Terminal state: show total without actions */}
      {isTerminal && (
        <div className="bg-[var(--color-background-secondary,#fafafa)] p-5 rounded-[14px] border border-[var(--color-border,#e4e4e7)] shadow-inner space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[16px] font-black text-[var(--color-foreground,#18181b)] tracking-tight">{commonT("total")}</span>
            <span className="text-[24px] font-black text-primary tabular-nums tracking-tighter">${(order.totalCents / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center opacity-60">
            <span className="text-[12px] font-bold text-zinc-500 italic">{t("exchange_rate")}</span>
            <span className="text-[15px] font-black text-zinc-700 tabular-nums">៛{(order.totalCents / 100 * 4000).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ── REJECT CONFIRM DIALOG ── */}
      <GlobalActionDialog
        isOpen={showRejectConfirm}
        onClose={() => setShowRejectConfirm(false)}
        onConfirm={onConfirmReject}
        title={t("reject_order")}
        description={`${t("reject_order")} #${order.orderNumber}?`}
        confirmLabel={t("reject_order")}
        variant="DESTRUCTIVE"
      >
        <div className="space-y-3">
          <label className="text-[11px] font-bold text-zinc-400 tracking-wider">
            {t("rejection_reason")}
          </label>
          <textarea
            placeholder="..."
            className="w-full h-24 bg-zinc-50 border border-zinc-100 rounded-2xl p-4 text-[13px] font-normal text-zinc-950 focus:outline-none focus:ring-1 focus:ring-rose-500/20 transition-all placeholder:text-zinc-300 resize-none"
          />
        </div>
      </GlobalActionDialog>
    </div>
  );
};
