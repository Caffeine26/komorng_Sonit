"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { MessageCircle, Clock, Settings, Bell, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface NotificationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  attentionCount: number;
  attentionOrders?: any[];
  newOrders?: any[];
}

export const NotificationSidebar = ({ isOpen, onClose, attentionCount, attentionOrders = [], newOrders = [] }: NotificationSidebarProps) => {
  const [mounted, setMounted] = useState(false);
  const t = useTranslations("notifications");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Map attention orders (updates) to notifications
  const dynamicNotifications = attentionOrders.map((order, idx) => {
    const newItemsCount = order.items?.filter((i: any) => i.isNewlyAdded).length || 0;
    return {
      id: order.id || order.orderId || `notif-${idx}`,
      type: "new_additions",
      title: t('new_items_added'),
      desc: `${order.tableRef || t('a_table')} ${t('added_items')} ${newItemsCount} ${newItemsCount === 1 ? t('new_item') : t('new_items')}`,
      icon: MessageCircle,
      iconColor: "text-blue-500",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-100/50",
    };
  });

  // Map brand new orders to notifications
  const newOrderNotifications = newOrders.map((order, idx) => {
    return {
      id: order.id || `new-${idx}`,
      type: "new_order",
      title: t('new_order_submitted'),
      desc: `${order.tableRef || t('a_table')} ${t('placed_new_order')}`,
      icon: Bell,
      iconColor: "text-orange-500",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-100/50",
    };
  });

  // Combine notifications, prioritize new orders first
  const notificationsToRender = [...newOrderNotifications, ...dynamicNotifications];

  // Fallback if no notifications
  const finalNotifications = notificationsToRender.length > 0 ? notificationsToRender : [{
    id: 'empty',
    type: 'empty',
    title: t('all_caught_up'),
    desc: t('no_new_notifications'),
    icon: Clock,
    iconColor: "text-zinc-400",
    bgColor: "bg-zinc-50",
    borderColor: "border-zinc-200",
  }];

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-zinc-900/10 backdrop-blur-[2px] z-50 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Tray */}
      <div 
        className={cn(
          "fixed top-0 right-0 h-full w-[360px] z-50 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col pt-24 pb-8",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex-1 w-full pl-6 flex flex-col gap-3">
          <div className="flex items-center justify-between pl-4 pr-6 mb-4">
            <span className="text-[14px] font-bold text-zinc-600 tracking-wide">{t('view_all')}</span>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/40 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-white/60 transition-colors shadow-sm border border-white/50"
            >
              <X size={16} />
            </button>
          </div>
          
          <div className="flex flex-col gap-3 relative">
            {notificationsToRender.map((notif, idx) => (
              <div 
                key={notif.id}
                className={cn(
                  "relative group w-full bg-white/70 backdrop-blur-xl border border-white/60 border-r-0 rounded-l-[32px] p-2 pl-2 shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_10px_20px_rgba(0,0,0,0.03)] flex items-center cursor-pointer",
                  "transition-all duration-300 hover:translate-x-[-8px] hover:bg-white/90"
                )}
                style={{
                  transitionDelay: isOpen ? `${idx * 50}ms` : '0ms',
                  transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
                  opacity: isOpen ? 1 : 0
                }}
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-[inset_0_1px_3px_rgba(255,255,255,1),0_2px_5px_rgba(0,0,0,0.05)] border",
                  notif.bgColor,
                  notif.borderColor
                )}>
                  <notif.icon className={cn("w-5 h-5", notif.iconColor)} />
                </div>
                <div className="ml-3 flex-1 pr-4">
                  <h4 className="text-[14px] font-bold text-zinc-800 leading-tight">{notif.title}</h4>
                  <p className="text-[13px] font-medium text-zinc-500 leading-tight mt-0.5">{notif.desc}</p>
                </div>
              </div>
            ))}

            {/* The Bell Icon attached to the bottom of the stack like the screenshot */}
            <div 
              className={cn(
                "relative mt-6 w-14 h-14 ml-2 rounded-full bg-white/90 backdrop-blur-xl border border-white/60 shadow-[inset_0_1px_2px_rgba(255,255,255,1),0_10px_25px_rgba(0,0,0,0.05)] flex items-center justify-center transition-all duration-500 delay-300",
                isOpen ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
              )}
            >
              <Bell className="text-zinc-600 w-6 h-6" />
              {attentionCount > 0 && (
                <span className="absolute -top-1 -right-1 w-6 h-6 flex items-center justify-center bg-pink-500 text-white text-[11px] font-black rounded-full border-2 border-white shadow-sm">
                  {attentionCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};
