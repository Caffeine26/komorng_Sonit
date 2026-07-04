"use client";
import { useLocale } from "next-intl";

import React, { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Megaphone, RefreshCw, Send, Eye, MousePointerClick, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useTenant } from "@/features/tenant/providers/TenantProvider";
import { TemplateManager } from "@/features/marketing/components/TemplateManager";
import { useMarketingInsights } from "@/features/marketing/hooks/useMarketingInsights";
import { EngagementTrendChart, EngagementBreakdownChart } from "@/features/marketing/components/MarketingCharts";
import { useTranslations } from "next-intl";

export default function MarketingPage() {
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;
  const locale = useLocale()
  const router = useRouter();
  const t = useTranslations("marketing");
  const { tenant, isLoading: isTenantLoading } = useTenant();

  const { data: insights, isLoading, refetch } = useMarketingInsights(tenantSlug);

  useEffect(() => {
    if (!isTenantLoading && tenant) {
      const roles: string[] = (tenant as any)?.currentUser?.roles || [];
      const isOwnerOrManager = roles.includes('TENANT_OWNER') || roles.includes('TENANT_MANAGER') || roles.includes('PLATFORM_ADMIN');
      if (!isOwnerOrManager) {
        router.replace(`/${tenantSlug}/orders`);
      }
    }
  }, [tenant, isTenantLoading, locale, tenantSlug, router]);

  return (
    <div className="min-h-screen bg-zinc-50/10 flex flex-col animate-ui-entry overflow-hidden">
      {/* TOP BAR */}
      <header className="py-6 sm:py-8 px-4 md:px-8 lg:px-10 flex flex-col lg:flex-row lg:items-center gap-6 justify-between flex-shrink-0 relative z-50 bg-zinc-50/10">
        <div className="flex flex-col">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Megaphone size={16} />
            </div>
            <h1 className="text-[24px] sm:text-[30px] font-medium text-zinc-950 tracking-tight leading-none">{t('title')}</h1>
          </div>
          <p className="text-[13px] sm:text-[15px] font-normal text-zinc-400">{t('desc')}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="w-14 h-14 bg-white/80 backdrop-blur-sm border border-zinc-100/50 rounded-[22px] flex items-center justify-center text-zinc-950 hover:bg-white hover:text-primary hover:border-primary/20 transition-all duration-300 shadow-sm cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={20} className={cn(isLoading && "animate-spin")} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="px-4 md:px-8 lg:px-10 pb-24 max-w-7xl mx-auto flex flex-col gap-8">
          
          {/* KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-[24px] border border-zinc-100 p-6 shadow-sm flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-transform group-hover:scale-150"></div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <Send size={20} />
                </div>
                <span className="text-[14px] font-medium text-zinc-500 tracking-wide">{t('total_sent')}</span>
              </div>
              <div className="text-[40px] font-medium text-zinc-900 leading-none mb-2">
                {isLoading ? '-' : insights?.totalSent || 0}
              </div>
              <div className="flex items-center gap-1.5 text-[13px] text-green-600 font-medium">
                <TrendingUp size={14} />
                <span>{t('active_reach')}</span>
              </div>
            </div>

            <div className="bg-white rounded-[24px] border border-zinc-100 p-6 shadow-sm flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-transform group-hover:scale-150"></div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Eye size={20} />
                </div>
                <span className="text-[14px] font-medium text-zinc-500 tracking-wide">{t('open_rate')}</span>
              </div>
              <div className="text-[40px] font-medium text-zinc-900 leading-none mb-2">
                {isLoading ? '-' : `${insights?.openRate.toFixed(1)}%`}
              </div>
              <div className="text-[13px] text-zinc-400">
                {isLoading ? '-' : insights?.totalOpened || 0} {t('total_opens')}
              </div>
            </div>

            <div className="bg-white rounded-[24px] border border-zinc-100 p-6 shadow-sm flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-transform group-hover:scale-150"></div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <MousePointerClick size={20} />
                </div>
                <span className="text-[14px] font-medium text-zinc-500 tracking-wide">{t('click_rate')}</span>
              </div>
              <div className="text-[40px] font-medium text-zinc-900 leading-none mb-2">
                {isLoading ? '-' : `${insights?.clickRate.toFixed(1)}%`}
              </div>
              <div className="text-[13px] text-zinc-400">
                {isLoading ? '-' : insights?.totalClicked || 0} {t('total_clicks')}
              </div>
            </div>
          </div>

          {/* CHARTS ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-[24px] border border-zinc-100 p-6 shadow-sm h-[400px] flex flex-col">
              <h3 className="text-[16px] font-medium text-zinc-900 mb-6">{t('trend')}</h3>
              <div className="flex-1 w-full min-h-0">
                <EngagementTrendChart data={insights?.chartData} isLoading={isLoading} />
              </div>
            </div>

            <div className="bg-white rounded-[24px] border border-zinc-100 p-6 shadow-sm h-[400px] flex flex-col items-center">
              <h3 className="text-[16px] font-medium text-zinc-900 mb-2 self-start">{t('breakdown')}</h3>
              <div className="flex-1 w-full min-h-0 flex justify-center items-center">
                <EngagementBreakdownChart 
                  totalSent={insights?.totalSent || 0}
                  totalOpened={insights?.totalOpened || 0}
                  totalClicked={insights?.totalClicked || 0}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </div>

          {/* TEMPLATE MANAGER SECTION */}
          <div className="h-[600px] flex flex-col">
            <TemplateManager tenantSlug={tenantSlug} />
          </div>

        </div>
      </div>
    </div>
  );
}
