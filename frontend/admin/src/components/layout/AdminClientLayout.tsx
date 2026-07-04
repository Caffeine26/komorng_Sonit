"use client";

import React, { type ReactNode, useState, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { TenantProvider } from '@/features/tenant/providers/TenantProvider';
import { useAdminOrdersAttention } from '@/features/order-management/hooks/useAdminOrdersAttention';

import { useParams } from 'next/navigation';

function AdminOrdersAttentionPoller() {
  useAdminOrdersAttention();
  return null;
}

interface AdminClientLayoutProps {
  children: ReactNode;
}

export function AdminClientLayout({ children }: AdminClientLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const params = useParams();
  const locale = params.locale as string;
  const tenantSlug = params.tenantSlug as string;

  useEffect(() => {
    const handleToggle = (e: any) => setIsCollapsed(e.detail?.isCollapsed || false);
    window.addEventListener('sidebar-toggle', handleToggle);
    return () => window.removeEventListener('sidebar-toggle', handleToggle);
  }, []);

  return (
    <TenantProvider tenantSlug={tenantSlug} locale={locale}>
      <AdminOrdersAttentionPoller />
      <div className="min-h-screen bg-[var(--color-background)] font-sans selection:bg-primary/10 overflow-x-hidden relative flex flex-col">
        {/* [uiux] Warm Organic Background Blobs (Reference-Matched) */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          {/* Deep Pink/Red Blob */}
          <div className="absolute bottom-[10%] left-[5%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
          {/* Soft Neutral Texture */}
          <div className="absolute top-[30%] left-[30%] w-[30%] h-[40%] bg-zinc-950/5 rounded-full blur-[100px]" />
        </div>
  
        <div className="flex-1 flex flex-col transition-all duration-500 ease-in-out relative pb-44">
          <div className="p-4 lg:p-8 flex flex-col gap-4 lg:gap-8 transition-all duration-500 w-full">
            <main className="pb-24">
              {children}
            </main>
          </div>
        </div>
        <AdminSidebar />
      </div>
    </TenantProvider>
  );
}
