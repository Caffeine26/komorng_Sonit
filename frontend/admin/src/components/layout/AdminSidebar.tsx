"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  UtensilsCrossed,
  ClipboardList,
  Users,
  UsersRound,
  MessageSquare,
  Settings,
  LogOut,
  Store,
  Menu,
  ChevronLeft,
  LayoutGrid,
  Table,
  PlusCircle,
  Megaphone
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { resolveMediaUrl } from "@/lib/utils/media-url";
import { useTenant } from "@/features/tenant/providers/TenantProvider";
import { useTranslations, useLocale } from "next-intl";
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog";
import { useAuth } from "@/features/auth/hooks/useAuth";


const NAV_ITEMS = [
  { id: "active_orders", href: "/orders", icon: ClipboardList, roles: ["TENANT_OWNER", "TENANT_MANAGER", "SERVICE_STAFF"] },
  { id: "new_order", href: "/new-order", icon: PlusCircle, roles: ["TENANT_OWNER", "TENANT_MANAGER", "SERVICE_STAFF"] },
  { id: "catalog_manager", href: "/menu", icon: UtensilsCrossed, roles: ["TENANT_OWNER", "TENANT_MANAGER", "SERVICE_STAFF"] },
  { id: "table_management", href: "/tables", icon: Table, roles: ["TENANT_OWNER", "TENANT_MANAGER", "SERVICE_STAFF"] },
  { id: "customer_list", href: "/customers", icon: UsersRound, roles: ["TENANT_OWNER", "TENANT_MANAGER", "SERVICE_STAFF"] },
  { id: "feedback_manager", href: "/feedback", icon: MessageSquare, roles: ["TENANT_OWNER", "TENANT_MANAGER"] },
  { id: "marketing", href: "/marketing", icon: Megaphone, roles: ["TENANT_OWNER", "TENANT_MANAGER"] },
  { id: "business_settings", href: "/settings", icon: Settings, roles: ["TENANT_OWNER", "TENANT_MANAGER"] },
  { id: "team_roles", href: "/team", icon: Users, roles: ["TENANT_OWNER"] },
];

export const AdminSidebar = () => {
  const t = useTranslations("sidebar");
  const locale = useLocale();
  const { tenant } = useTenant();
  const { handleLogout } = useAuth();
  const { tenantSlug } = useParams();
  const pathname = usePathname();
  const [isStoreOnline, setIsStoreOnline] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const roles: string[] = (tenant as any)?.currentUser?.roles || [];
  let userRole = 'SERVICE_STAFF';
  if (roles.includes('PLATFORM_ADMIN')) {
    userRole = 'PLATFORM_ADMIN';
  } else if (roles.includes('TENANT_OWNER')) {
    userRole = 'TENANT_OWNER';
  } else if (roles.includes('TENANT_MANAGER')) {
    userRole = 'TENANT_MANAGER';
  } else if (roles.includes('SERVICE_STAFF')) {
    userRole = 'SERVICE_STAFF';
  }
  const visibleNavItems = NAV_ITEMS.filter(item => {
    // Platform admins see everything for now
    if (userRole === 'PLATFORM_ADMIN') return true;
    return item.roles.includes(userRole);
  });

  // Sync state with layout via custom event for smart centering
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { isCollapsed } }));
  }, [isCollapsed]);

  // Listen for mobile toggle events
  useEffect(() => {
    const handleMobileToggle = () => setIsMobileOpen(prev => !prev);
    window.addEventListener('mobile-sidebar-toggle', handleMobileToggle);
    return () => window.removeEventListener('mobile-sidebar-toggle', handleMobileToggle);
  }, []);

  const handleStatusToggle = () => {
    setIsStatusDialogOpen(true);
  };

  const confirmStatusToggle = () => {
    setIsStoreOnline(!isStoreOnline);
    setIsStatusDialogOpen(false);
  };
  return (
    <>
      <aside
        className="fixed bottom-4 left-4 right-4 z-[60] flex items-center justify-between h-24 transition-all duration-500 ease-in-out rounded-[32px] border border-white/70 shadow-[0_12px_48px_rgba(0,0,0,0.08)]"
        style={{
          backgroundColor: "rgba(255, 248, 240, 0.4)",
          backdropFilter: "blur(40px) saturate(250%)",
          WebkitBackdropFilter: "blur(40px) saturate(250%)",
          boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.7), 0 20px 40px rgba(0,0,0,0.05)"
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none rounded-[32px]" />

        {/* Left Section: Logo & Status */}
        <div className="flex items-center gap-4 relative z-10 shrink-0 px-6">
          <div className="w-12 h-12 overflow-hidden bg-primary rounded-2xl flex items-center justify-center text-white shrink-0 relative cursor-pointer" onClick={handleStatusToggle}>
            {tenant?.settings?.logoUrl ? (
              <img
                src={resolveMediaUrl(tenant.settings.logoUrl)}
                alt="Logo"
                className="w-full h-full object-cover"
              />
            ) : (
              <Store size={24} strokeWidth={2} />
            )}
            {/* Live Status indicator */}
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white",
              isStoreOnline ? "bg-primary" : "bg-zinc-400"
            )} />
          </div>
          <div className="hidden lg:block">
            <h1 className="text-zinc-950 font-medium text-[16px] tracking-tight leading-none truncate max-w-[140px]">
              {locale === "km" ? ((tenant as any)?.nameKm || tenant?.nameEn || tenant?.name || "Loading...") : (tenant?.nameEn || tenant?.name || "Loading...")}
            </h1>
            <span className="text-[11px] font-normal text-zinc-500 mt-1 block tracking-tight">
              {isStoreOnline ? t('active') : t('store_offline')}
            </span>
          </div>
        </div>

        {/* Middle Section: Centered Navigation Row */}
        <nav className="flex-1 flex items-center justify-center gap-3 sm:gap-5 overflow-x-auto no-scrollbar relative z-10 px-4">
          {visibleNavItems.map((item) => {
            const currentSlug = (tenantSlug as string) || tenant?.slug || "sovanaphum";
            const fullHref = `/${currentSlug}${item.href === '/' ? '' : item.href}`;
            const isActive = pathname === fullHref || (item.href !== "/" && pathname.startsWith(fullHref));
            const Icon = item.icon;
            if (!Icon) return null;

            return (
              <Link
                key={item.id}
                href={fullHref}
                className={cn(
                  "group flex items-center justify-center gap-2.5 p-3.5 sm:p-4 rounded-[22px] transition-all duration-300 relative overflow-hidden shrink-0 min-w-[50px] min-h-[50px]",
                  isActive
                    ? "bg-white text-primary border border-white/80 shadow-sm px-5 sm:px-6"
                    : "text-zinc-700 hover:bg-white/40 hover:text-primary"
                )}
              >
                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className={cn("transition-transform group-hover:scale-110 relative z-10 shrink-0", isActive ? "text-primary" : "text-zinc-950")} />
                {isActive && (
                  <span className="text-[14px] sm:text-[15px] font-normal relative z-10 whitespace-nowrap animate-ui-entry">
                    {t(item.id)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Section: User & Logout */}
        <div className="flex items-center gap-4 relative z-10 shrink-0 px-6">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-primary flex items-center justify-center text-white font-normal text-[13px] cursor-pointer hover:scale-105 transition-all shadow-sm shrink-0 border border-white">
            {(tenant as any)?.currentUser?.avatarUrl ? (
              <img
                src={resolveMediaUrl((tenant as any)?.currentUser?.avatarUrl)}
                alt="User Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              ((tenant as any)?.currentUser?.fullName || "ME").substring(0, 2).toUpperCase()
            )}
          </div>
          
          <button
            onClick={() => setIsLogoutDialogOpen(true)}
            className="w-12 h-12 rounded-2xl text-zinc-500 hover:bg-red-50/50 hover:text-red-500 flex items-center justify-center transition-all cursor-pointer bg-white/40 border border-white/40 shrink-0"
          >
            <LogOut size={24} strokeWidth={2} />
          </button>
        </div>
      </aside>

      <GlobalActionDialog
        isOpen={isStatusDialogOpen}
        onClose={() => setIsStatusDialogOpen(false)}
        onConfirm={confirmStatusToggle}
        title={isStoreOnline ? t('go_offline_title') : t('go_online_title')}
        description={isStoreOnline ? t('go_offline_desc') : t('go_online_desc')}
        confirmLabel={t('confirm_toggle')}
        variant={isStoreOnline ? "DESTRUCTIVE" : "DEFAULT"}
      />
      <GlobalActionDialog
        isOpen={isLogoutDialogOpen}
        onClose={() => setIsLogoutDialogOpen(false)}
        onConfirm={() => {
          setIsLogoutDialogOpen(false);
          handleLogout();
        }}
        title={t('logout_title')}
        description={t('logout_desc')}
        confirmLabel={t('logout_confirm')}
        variant="DESTRUCTIVE"
      />
    </>
  );
};
