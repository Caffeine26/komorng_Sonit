"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bell,
  Search,
  UserCircle,
  Settings,
  Menu
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useTenant } from "@/features/tenant/providers/TenantProvider";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { NotificationSidebar } from "./NotificationSidebar";

export const AdminHeader = () => {
  const t = useTranslations("common");
  const tSidebar = useTranslations("sidebar");
  const { tenant } = useTenant();
  const { locale, tenantSlug } = useParams();

  const [attentionCount, setAttentionCount] = useState(0);
  const [attentionOrders, setAttentionOrders] = useState<any[]>([]);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [newOrders, setNewOrders] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const lastSoundTime = useRef(0);
  const prevNewOrdersCount = useRef(0);

  useEffect(() => {
    const handleAttentionUpdate = (e: any) => {
      const updatedAttentionCount = e.detail?.count || 0;
      const orders = e.detail?.orders || [];
      const incomingNewOrdersCount = e.detail?.newOrdersCount || 0;
      const incomingNewOrders = e.detail?.newOrders || [];
      
      setAttentionOrders(orders);
      setNewOrders(incomingNewOrders);
      setNewOrdersCount(incomingNewOrdersCount);
      
      const now = Date.now();
      let soundPlayed = false;

      // Check for completely new orders
      if (incomingNewOrdersCount > prevNewOrdersCount.current) {
        setIsSidebarOpen(true);
        if (now - lastSoundTime.current > 5000) {
          lastSoundTime.current = now;
          soundPlayed = true;
          try {
            const audio = new Audio('/sound/order.mp3');
            audio.play().catch(() => {});
          } catch (e) {}
        }
      }
      prevNewOrdersCount.current = incomingNewOrdersCount;

      setAttentionCount((prev) => {
        // Check for updates (additions to existing orders)
        if (updatedAttentionCount > prev) {
          // Auto-open sidebar when new updates arrive
          setIsSidebarOpen(true);

          if (!soundPlayed && now - lastSoundTime.current > 5000) {
            lastSoundTime.current = now;
            try {
              const audio = new Audio('/sound/update.mp3');
              audio.play().catch(() => {});
            } catch (e) {}
          }
        }
        return updatedAttentionCount;
      });
    };

    window.addEventListener('orders-attention-update', handleAttentionUpdate);
    return () => window.removeEventListener('orders-attention-update', handleAttentionUpdate);
  }, []);

  return (
    <header
      className={cn(
        "h-16 lg:h-20 flex items-center justify-between px-4 lg:px-8 z-40 sticky top-0",
        "rounded-2xl lg:rounded-[28px] bg-white border border-zinc-900/10 shadow-sm"
      )}
    >

      {/* Left: Mobile Toggle & Section Indicator */}
      <div className="flex items-center gap-3 relative z-10">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('mobile-sidebar-toggle'))}
          className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/40 border border-white/70 hover:bg-white/60 transition-all shadow-sm"
        >
          <Menu size={20} strokeWidth={2} className="text-zinc-500" />
        </button>
      </div>

      {/* Middle: Search (Desktop only or expanded) */}
      <div className="hidden lg:block relative w-[400px] xl:w-[480px] z-10">
        <Search size={18} strokeWidth={2} className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder={t('search_placeholder')}
          className="w-full bg-zinc-100/50 border border-transparent rounded-[18px] py-3 pl-14 pr-6 text-sm font-medium text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-300 focus:ring-4 focus:ring-zinc-900/5 transition-all"
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 lg:gap-4 relative z-10">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="relative w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-xl lg:rounded-[18px] hover:bg-zinc-100 transition-all group"
        >
          <Bell size={20} strokeWidth={2} className="text-zinc-500 group-hover:text-zinc-950 transition-colors" />
          {attentionCount > 0 && (
            <span className="absolute -top-1 -right-1 lg:top-0 lg:right-0 w-5 h-5 flex items-center justify-center bg-orange-500 text-white text-[10px] font-bold rounded-full border-2 border-white animate-in zoom-in">
              {attentionCount}
            </span>
          )}
        </button>

        <Link href="/settings" className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-xl lg:rounded-[18px] hover:bg-zinc-100 transition-all group">
          <Settings size={20} strokeWidth={2} className="text-zinc-500 group-hover:text-zinc-950 transition-colors" />
        </Link>

        <Link href="/team" className="flex items-center gap-2 lg:gap-4 lg:ml-2 lg:pl-6 lg:border-l lg:border-white/50 group cursor-pointer">
          <div className="hidden sm:block text-right transition-transform group-hover:-translate-x-1 duration-300">
            <p className="text-sm font-medium text-zinc-950 leading-none truncate max-w-[120px]">
              {(tenant as any)?.currentUser?.fullName || 'Merchant Owner'}
            </p>
            <p className="text-[10px] font-medium text-primary mt-1">
              {(() => {
                const roles: string[] = (tenant as any)?.currentUser?.roles || [];
                if (roles.includes('PLATFORM_ADMIN')) return tSidebar('role_admin');
                if (roles.includes('TENANT_OWNER')) return tSidebar('role_owner');
                if (roles.includes('TENANT_MANAGER')) return tSidebar('role_manager');
                if (roles.includes('SERVICE_STAFF')) return tSidebar('role_service');
                return tSidebar('role_staff');
              })()}
            </p>
          </div>
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-[18px] overflow-hidden bg-primary flex items-center justify-center text-white group-hover:scale-105 transition-transform shadow-sm">
            {(tenant as any)?.currentUser?.avatarUrl ? (
              <img
                src={(tenant as any)?.currentUser?.avatarUrl}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <UserCircle size={24} strokeWidth={2} />
            )}
          </div>
        </Link>
      </div>

      <NotificationSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        attentionCount={attentionCount}
        attentionOrders={attentionOrders}
        newOrders={newOrders}
      />
    </header>
  );
};
