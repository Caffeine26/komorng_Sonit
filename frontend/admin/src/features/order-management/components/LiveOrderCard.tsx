"use client";

import React from "react";
import { 
  Clock, 
  ChevronRight, 
  CheckCircle2, 
  Printer, 
  MoreHorizontal,
  Timer
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLocale } from "next-intl";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  options?: string[];
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  items: OrderItem[];
  status: "Preparing" | "Ready" | "Delayed" | "Completed";
  type: "Dine-in" | "Takeaway" | "Delivery";
  createdAt: string;
  totalPrice: number;
}

interface LiveOrderCardProps {
  order: Order;
  onAction?: (action: string, orderId: string) => void;
}

export const LiveOrderCard = ({ order, onAction }: LiveOrderCardProps) => {
  const locale = useLocale();

  // [uiux] Status Theme Mapping
  const statusThemes = {
    Preparing: "bg-amber-50 text-amber-600 border-amber-100",
    Ready: "bg-emerald-50 text-emerald-600 border-emerald-100",
    Delayed: "bg-amber-50 text-amber-600 border-amber-100",
    Completed: "bg-zinc-50 text-zinc-400 border-zinc-100",
  };

  const statusDots = {
    Preparing: "bg-amber-500",
    Ready: "bg-emerald-500",
    Delayed: "bg-amber-500",
    Completed: "bg-zinc-300",
  };

  return (
    <div 
      className="group relative flex flex-col rounded-[32px] transition-all duration-300 animate-ui-entry transform-gpu hover:scale-[1.02]"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.65)",
        backdropFilter: "blur(20px) saturate(160%)",
        border: "1px solid rgba(255, 255, 255, 0.42)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)"
      }}
    >
      {/* Top Bar: Identity & Time */}
      <div className="p-5 flex items-center justify-between border-b border-white/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-zinc-950 flex items-center justify-center text-white shadow-lg shadow-zinc-950/20">
            <span className="text-[14px] font-bold">#{order.orderNumber.slice(-2)}</span>
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-zinc-950 tracking-tight">{order.customerName}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-bold text-zinc-400tracking-wider">{order.type}</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-white/60 rounded-full border border-white/80 shadow-sm">
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", statusDots[order.status])} />
            <span className="text-[10px] font-bold text-zinc-600 tabular-nums">12:05</span>
          </div>
          <span className="text-[9px] font-medium text-zinc-400 mt-1">Placed 4m ago</span>
        </div>
      </div>

      {/* Item List: High-Density Feed */}
      <div className="p-5 flex-1 space-y-4">
        <div className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-zinc-950 tabular-nums">{item.quantity}</span>
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-zinc-950 leading-tight">
                  {(() => {
                    const nameParts = (item.name || '').split(' / ');
                    const nameKm = nameParts[0] || item.name;
                    const nameEn = nameParts[1] || item.name;
                    return locale === 'km' ? nameKm : nameEn;
                  })()}
                </p>
                {item.options && (
                  <p className="text-[10px] font-medium text-zinc-400 mt-0.5 leading-relaxed">
                    {item.options.join(" • ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Total & Summary */}
        <div className="pt-4 border-t border-white/40 flex items-center justify-between">
          <span className="text-[11px] font-medium text-zinc-400">{order.items.length} items</span>
          <span className="text-[15px] font-bold text-zinc-950">${order.totalPrice.toFixed(2)}</span>
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-3 bg-white/40 border-t border-white/60 rounded-b-[32px] flex items-center gap-2">
        <button 
          onClick={() => onAction?.("print", order.id)}
          className="w-11 h-11 rounded-2xl bg-white border border-white shadow-sm flex items-center justify-center text-zinc-400 hover:text-zinc-950 transition-all active:scale-90"
        >
          <Printer size={18} strokeWidth={2} />
        </button>
        <button 
          onClick={() => onAction?.("ready", order.id)}
          className="flex-1 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 hover:opacity-90 active:scale-95 transition-all"
        >
          <CheckCircle2 size={18} strokeWidth={2.5} />
          <span className="text-[13px] font-bold">Mark as ready</span>
        </button>
      </div>
    </div>
  );
};
