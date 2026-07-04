"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Store, 
  CreditCard, 
  Clock, 
  Palette, 
  Globe, 
  Zap, 
  Phone, 
  MapPin,
  Save
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog";
import { SettingsContext } from "@/features/settings/components/shared/SettingsContext";
import { getAdminSettings, updateAdminSettings } from "@/lib/api/settings";
import { type Tenant } from "@xfos/contracts-tenant";
import { useTenant } from "@/features/tenant/providers/TenantProvider";

// Modular feature components
import { GeneralProfile } from "@/features/settings/components/GeneralProfile";
import { AppearanceSettings } from "@/features/settings/components/AppearanceSettings";
import { LocalizationSettings } from "@/features/settings/components/LocalizationSettings";
import { OperationalSettings } from "@/features/settings/components/OperationalSettings";
import { ContactSettings } from "@/features/settings/components/ContactSettings";
import { LocationSettings } from "@/features/settings/components/LocationSettings";
import { PaymentMethods } from "@/features/settings/components/PaymentMethods";
import { OperatingHours } from "@/features/settings/components/OperatingHours";

import { useTranslations } from "next-intl";

type SettingTab = 
  | "General" 
  | "Appearance" 
  | "Localization" 
  | "Operational" 
  | "Contacts" 
  | "Location" 
  | "Payments" 
  | "OperatingHours";

export default function BusinessSettingsPage({ params }: { params: { locale: string; tenantSlug: string } }) {
  const t = useTranslations("settings");
  const { tenantSlug, locale } = params;
  const router = useRouter();
  const { refreshTenant, tenant, isLoading: isTenantLoading } = useTenant();

  useEffect(() => {
    if (!isTenantLoading && tenant) {
      const roles: string[] = (tenant as any)?.currentUser?.roles || [];
      const hasAccess = roles.includes('TENANT_OWNER') || roles.includes('TENANT_MANAGER') || roles.includes('PLATFORM_ADMIN');
      if (!hasAccess) {
        router.replace(`/${tenantSlug}/orders`);
      }
    }
  }, [tenant, isTenantLoading, locale, tenantSlug, router]);

  const roles: string[] = (tenant as any)?.currentUser?.roles || [];
  const hasAccess = roles.includes('TENANT_OWNER') || roles.includes('TENANT_MANAGER') || roles.includes('PLATFORM_ADMIN');

  if (isTenantLoading || !hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  const [activeTab, setActiveTab] = useState<SettingTab>("General");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<Tenant | null>(null);
  const [originalData, setOriginalData] = useState<Tenant | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const TABS: { id: SettingTab; icon: any; label: string; description: string }[] = [
    { id: "General", icon: Store, label: t('tabs.general'), description: t('descriptions.general') },
    { id: "Appearance", icon: Palette, label: t('tabs.appearance'), description: t('descriptions.appearance') },
    { id: "Localization", icon: Globe, label: t('tabs.localization'), description: t('descriptions.localization') },
    { id: "Operational", icon: Zap, label: t('tabs.operational'), description: t('descriptions.operational') },
    { id: "Contacts", icon: Phone, label: t('tabs.contacts'), description: t('descriptions.contacts') },
    { id: "Location", icon: MapPin, label: t('tabs.location'), description: t('descriptions.location') },
    { id: "Payments", icon: CreditCard, label: t('tabs.payments'), description: t('descriptions.payments') },
    { id: "OperatingHours", icon: Clock, label: t('tabs.hours'), description: t('descriptions.hours') },
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const settings = await getAdminSettings(tenantSlug);
      
      // CONSISTENCY CHECK: Ensure URL slug matches the Authenticated Identity
      if (settings.slug !== tenantSlug) {
        console.warn(`Slug mismatch! Redirecting from ${tenantSlug} to ${settings.slug}`);
        router.push(`/${settings.slug}/settings`);
        return;
      }

      setData(settings);
      setOriginalData(settings);
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateLocalData = (updates: Partial<Tenant>) => {
    setData((prev) => {
      const currentState = prev || { settings: {} } as Tenant;
      return {
        ...currentState,
        ...updates,
        settings: {
          ...currentState.settings,
          ...(updates.settings || {}),
        } as any
      };
    });
  };

  const handleCancel = () => {
    setData(originalData);
    setIsEditing(false);
  };

  const [error, setError] = useState<string | null>(null);

  const validate = (): boolean => {
    if (!data) {
      setError(t('errors.store_not_found'));
      return false;
    }
    if (!data.nameEn && !data.name) {
      setError(t('errors.name_required'));
      return false;
    }
    if (!data.slug) {
      setError(t('errors.slug_required'));
      return false;
    }
    // Basic slug validation: lowercase, numbers, and dashes only
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(data.slug)) {
      setError(t('errors.slug_invalid'));
      return false;
    }
    setError(null);
    return true;
  };

  const handleSave = () => {
    if (validate()) {
      setShowConfirm(true);
    }
  };

  const onConfirmSave = async () => {
    if (!data) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateAdminSettings({
        ...data.settings,
        nameEn: data.nameEn,
        nameKm: data.nameKm,
        slug: data.slug,
        codePrefix: data.codePrefix,
        serviceModel: data.serviceModel,
        operatingHours: data.operatingHours,
        paymentMethods: data.paymentMethods,
      } as any, tenantSlug);

      await refreshTenant(); // SYNC GLOBAL UI
      setOriginalData(data); // SYNC LOCAL BACKUP
      setShowConfirm(false);
      setIsEditing(false);
      
      const newSlug = data.slug || tenantSlug;
      
      if (newSlug !== tenantSlug) {
        router.push(`/${newSlug}/settings`);
        return;
      }
    } catch (err: any) {
      console.error("Failed to save settings:", err);
      setError(err.message || "Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
      setShowConfirm(false);
    }
  };

  const renderActiveContent = () => {
    switch (activeTab) {
      case "General": return <GeneralProfile />;
      case "Appearance": return <AppearanceSettings />;
      case "Localization": return <LocalizationSettings />;
      case "Operational": return <OperationalSettings />;
      case "Contacts": return <ContactSettings />;
      case "Location": return <LocationSettings />;
      case "Payments": return <PaymentMethods />;
      case "OperatingHours": return <OperatingHours />;
      default: return <GeneralProfile />;
    }
  };

  return (
    <div className="bg-white flex flex-col animate-ui-entry rounded-[32px] sm:rounded-[48px] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-zinc-100">
      
      {/* ── ERROR BANNER ── */}
      {error && (
        <div className="mx-4 sm:mx-10 mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
            <Zap size={16} />
          </div>
          <p className="text-[13px] font-normal text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 px-2 py-1 text-[12px] font-medium">Dismiss</button>
        </div>
      )}

      {/* ── TOP BAR: Liquid Glass Header ── */}
      <header className="py-4 sm:py-6 px-4 sm:px-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0 relative z-50 bg-white border-b border-zinc-50">
        <div className="flex flex-col">
          <h1 className="text-[20px] sm:text-[26px] font-normal text-zinc-950 tracking-tight leading-none">{t('title')}</h1>
          <p className="text-[12px] sm:text-[14px] font-normal text-zinc-400 mt-1.5">{t('description')}</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {!isEditing ? (
            <button 
              onClick={() => setIsEditing(true)}
              className="h-11 sm:h-12 flex-1 sm:flex-none px-6 sm:px-8 bg-primary text-white rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 sm:gap-3 text-[13px] sm:text-[14px] font-normal hover:opacity-90 transition-all cursor-pointer"
            >
              <span>{t('edit_settings')}</span>
            </button>
          ) : (
            <>
              <button 
                disabled={isSaving}
                onClick={handleCancel}
                className="h-11 sm:h-12 px-4 sm:px-6 text-zinc-500 hover:text-zinc-950 text-[13px] sm:text-[14px] font-normal transition-all cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button 
                disabled={isSaving}
                onClick={handleSave}
                className="h-11 sm:h-12 flex-1 sm:flex-none px-6 sm:px-8 bg-emerald-500 text-white rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 sm:gap-3 text-[13px] sm:text-[14px] font-normal hover:bg-emerald-600 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={18} strokeWidth={2} />
                )}
                <span>{isSaving ? "..." : t('save_changes')}</span>
              </button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* ── LEFT RAIL: Category Navigation (Responsive) ── */}
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-zinc-100 bg-white flex flex-col overflow-y-auto no-scrollbar">
          <div className="p-4 sm:p-8 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible no-scrollbar">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              
              // Safety Guard: Prevent crash if icon is undefined
              if (!Icon) return null;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "p-3 sm:p-4 rounded-xl sm:rounded-[24px] flex items-center gap-3 sm:gap-4 transition-all duration-300 relative group text-left cursor-pointer shrink-0 lg:shrink-1 focus:outline-none",
                    isActive 
                      ? "bg-white shadow-xl shadow-zinc-200/50 border border-primary/30" 
                      : "hover:bg-white/50 border border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center transition-all",
                    isActive ? "bg-primary text-white shadow-lg shadow-pink-500/20" : "bg-zinc-50 text-zinc-950 group-hover:text-primary"
                  )}>
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0 pr-2 lg:pr-0">
                    <p className={cn("text-[13px] sm:text-[14px] font-normal leading-none", isActive ? "text-zinc-950" : "text-zinc-950")}>{tab.label}</p>
                    <p className="hidden lg:block text-[11px] font-normal text-zinc-400 mt-1.5 truncate">{tab.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── CONTENT AREA: Multi-Category Panels ── */}
        <div className="flex-1 overflow-y-auto no-scrollbar bg-white p-4 sm:p-10 lg:p-16">
          <div className={cn(
            "max-w-[1200px] mx-auto min-h-full",
          )}>
            <SettingsContext.Provider value={{ isEditing, setIsEditing, data, isLoading, updateLocalData }}>
              {renderActiveContent()}
            </SettingsContext.Provider>
          </div>
        </div>
      </main>

    {showConfirm && (
      <GlobalActionDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={onConfirmSave}
        title={t('dialog.save_title')}
        description={t('dialog.save_desc')}
        confirmLabel={t('dialog.confirm_label')}
        variant="DEFAULT"
        isLoading={isSaving}
      />
    )}
  </div>
);
}
