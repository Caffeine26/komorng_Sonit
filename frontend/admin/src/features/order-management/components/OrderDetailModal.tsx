"use client";

import React from "react";
import { X, CreditCard, Download, Users, Hash, Clock } from "lucide-react";
import { Order } from "./OrderCard";
import { useLocale } from "next-intl";

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPay: () => void;
  order: Order | null;
}

export const OrderDetailModal = ({ isOpen, onClose, onPay, order }: OrderDetailModalProps) => {
  const locale = useLocale();

  if (!isOpen || !order) return null;

  const subtotal = order.total;
  const tax = subtotal * 0.05;
  const grandTotal = subtotal + tax;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200 p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Horizontal two-panel: fixed height, no scroll */}
      <div className="relative w-full max-w-3xl bg-white rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex" style={{ height: "560px" }}>

        {/* ── LEFT: Invoice receipt panel ── */}
        <div className="flex flex-col w-[300px] shrink-0 bg-white border-r border-zinc-100 overflow-hidden">
          {/* Header: customer */}
          <div className="px-8 pt-8 pb-6 border-b border-zinc-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-[#FF7D54]/10 text-[#FF7D54] flex items-center justify-center text-[15px] font-bold shrink-0">
                {order.tableId}
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-zinc-950 leading-none truncate">{order.customerName}</p>
                <p className="text-[11px] font-medium text-zinc-400 mt-1">order #{order.orderNumber} · dine in</p>
              </div>
              <div className="ml-auto text-right shrink-0">
                <p className="text-[10px] font-medium text-zinc-400">{order.date}</p>
                <p className="text-[10px] font-medium text-zinc-400 mt-0.5">{order.time}</p>
              </div>
            </div>
          </div>

          {/* Transaction details: scrollable if needed */}
          <div className="flex-1 px-8 pt-6 overflow-y-auto no-scrollbar">
            <p className="text-[11px] font-bold text-zinc-400 mb-4">transaction details</p>
            <div className="flex flex-col gap-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-950 leading-tight">
                      {(() => {
                        const nameParts = (item.name || '').split(' / ');
                        const nameKm = nameParts[0] || item.name;
                        const nameEn = nameParts[1] || item.name;
                        return locale === 'km' ? nameKm : nameEn;
                      })()}
                    </p>
                    <p className="text-[12px] font-bold text-zinc-950 mt-1">${item.price.toFixed(2)}</p>
                  </div>
                  <span className="text-[12px] font-bold text-zinc-300 shrink-0">{item.quantity}x</span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals: pinned at bottom */}
          <div className="px-8 py-6 border-t border-dashed border-zinc-100 space-y-2.5">
            <div className="flex justify-between text-[12px] font-medium text-zinc-400">
              <span>items ({order.items.length})</span>
              <span className="tabular-nums">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[12px] font-medium text-zinc-400">
              <span>tax (5%)</span>
              <span className="tabular-nums">${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-zinc-100">
              <span className="text-[15px] font-bold text-zinc-950">total</span>
              <span className="text-[18px] font-bold text-zinc-950 tabular-nums">${grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Actions panel ── */}
        <div className="flex-1 flex flex-col bg-zinc-50/50">
          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white border border-zinc-100 hover:bg-zinc-50 flex items-center justify-center text-zinc-400 hover:text-zinc-950 transition-all duration-150 cursor-pointer shadow-sm"
          >
            <X size={16} strokeWidth={2.5} />
          </button>

          <div className="flex-1 flex flex-col justify-center px-10 pt-14 pb-8 gap-6">
            {/* Summary display */}
            <div>
              <p className="text-[13px] font-medium text-zinc-400">order summary</p>
              <p className="text-[42px] font-bold text-zinc-950 tabular-nums tracking-tighter leading-none mt-2">${grandTotal.toFixed(2)}</p>
              <p className="text-[13px] font-medium text-zinc-400 mt-2">{order.items.length} items · table {order.tableId}</p>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full ${order.status === "completed" ? "bg-emerald-400" : order.status === "accepted" ? "bg-blue-400" : "bg-rose-400"}`} />
              <span className="text-[13px] font-semibold text-zinc-600">{order.status}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-10 pb-10 flex flex-col gap-3">
            <button
              onClick={onPay}
              className="w-full h-14 bg-[#FF7D54] hover:opacity-90 active:scale-[0.98] text-white rounded-2xl flex items-center justify-center gap-2.5 text-[15px] font-bold transition-all duration-150 shadow-lg shadow-orange-500/20 cursor-pointer"
            >
              <CreditCard size={18} strokeWidth={2.5} />
              pay bills
            </button>
            <button className="w-full h-11 bg-white border border-zinc-100 hover:bg-zinc-50 text-zinc-400 hover:text-zinc-600 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-semibold transition-all duration-150 cursor-pointer">
              <Download size={15} strokeWidth={2} />
              get pdf invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
