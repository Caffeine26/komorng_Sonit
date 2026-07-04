"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { type Tenant } from '@xfos/contracts-tenant';
import { getAdminSettings } from "@/lib/api/settings";
import { env } from '@/config/env';
import { useSession } from 'next-auth/react';

interface TenantContextType {
  tenant: Tenant | null;
  isLoading: boolean;
  error: Error | null;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ 
  children,
  tenantSlug,
  locale = 'km'
}: { 
  children: React.ReactNode,
  tenantSlug?: string,
  locale?: string
}) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isSafariBlocked, setIsSafariBlocked] = useState(false);
  const { data: session, status } = useSession();

  const fetchTenant = async () => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
        window.location.href = `/auth/login`;
        return;
    }

    setIsLoading(true);
    setIsSafariBlocked(false);
    try {
      const data = await getAdminSettings(tenantSlug);
      
      if (tenantSlug && data.slug !== tenantSlug) {
        window.location.href = window.location.href.replace(`/${tenantSlug}`, `/${data.slug}`);
        return;
      }

      setTenant(data);
    } catch (err: any) {
      console.error('[TenantProvider] Critical failure fetching merchant settings:', {
        status: err.status,
        message: err.message,
        tenantSlug
      });
      
      // ONLY trigger Safari block UI if there is NO status (meaning the request never reached the server)
      // and it looks like a network/CORS failure.
      if (!err.status && (err instanceof TypeError || err.message === 'Load failed')) {
          setIsSafariBlocked(true);
      } else {
          setError(err);
          // Only redirect on unauthorized or missing merchant
          if (err.status === 401 || err.status === 404) {
            window.location.href = `/auth/login`;
          }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchTenant();
  }, [tenantSlug, status]);

  useEffect(() => {
    if (tenant?.settings?.primaryColor) {
      document.documentElement.style.setProperty('--primary', tenant.settings.primaryColor as string);
    }

    if (tenant?.settings?.defaultLocale) {
      const match = document.cookie.match(/(?:^|;)\s*NEXT_LOCALE=([^;]*)/);
      const currentCookieLocale = match ? match[1] : null;
      if (currentCookieLocale !== tenant.settings.defaultLocale) {
        document.cookie = `NEXT_LOCALE=${tenant.settings.defaultLocale}; path=/; max-age=31536000`;
        window.location.reload();
      }
    }
  }, [tenant]);

  return (
    <TenantContext.Provider value={{ 
      tenant, 
      isLoading, 
      error, 
      refreshTenant: fetchTenant 
    }}>
      {/* 
        [safari-rescue] Show a clear authorize button if Safari is blocking the API 
      */}
      {isSafariBlocked ? (
        <div className="fixed inset-0 bg-white flex items-center justify-center p-6 z-[999]">
          <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
             <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
                    <path d="M12 16V12" />
                    <path d="M12 8H12.01" />
                </svg>
             </div>
             <div>
                <h1 className="text-2xl font-bold text-zinc-950 mb-2">Safari Connection Blocked</h1>
                <p className="text-zinc-500 font-medium leading-relaxed">
                  Safari is preventing your dashboard from talking to the API. 
                  Please click the button below to authorize the connection.
                </p>
             </div>
             <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100 text-left space-y-2">
                <p className="text-[11px] font-bold text-zinc-400tracking-widest">Instructions</p>
                <ol className="text-[13px] text-zinc-600 space-y-1 font-medium list-decimal ml-4">
                    <li>Click the button below to open the API tunnel.</li>
                    <li>If you see a warning, click <b>&quot;Visit Site&quot;</b>.</li>
                    <li>Close that tab and refresh this page.</li>
                </ol>
             </div>
             <a 
               href={env.NEXT_PUBLIC_API_BASE_URL} 
               target="_blank" 
               rel="noopener noreferrer"
               className="block w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95"
             >
               Authorize API Connection
             </a>
             <button onClick={() => window.location.reload()} className="text-zinc-400 font-bold text-sm hover:text-zinc-600 transition-colors">
                I&apos;ve done this, refresh now
             </button>
          </div>
        </div>
      ) : !isLoading && tenant ? (
        children
      ) : (
        <div className="fixed inset-0 bg-zinc-50 flex items-center justify-center z-[999]">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      )}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
