import React from "react";
import { Zap } from "lucide-react";
import { SettingsSection } from "./shared/SettingsSection";
import { SettingsLabel } from "./shared/SettingsLabel";
import { cn } from "@/lib/utils/cn";
import { useSettingsContext } from "./shared/SettingsContext";
import { SettingsListBlock, SettingsListRow } from "./shared/SettingsListBlock";
import { SettingsSwitch } from "./shared/SettingsSwitch";

import { useTranslations } from "next-intl";

export function OperationalSettings() {
  const t = useTranslations("settings.operational");
  const { isEditing, data, updateLocalData } = useSettingsContext();

  const autoAccept = data?.settings?.autoAcceptOrders ?? true;
  const serviceModel = data?.serviceModel ?? "STALL_KIOSK";
  const paymentTiming = data?.settings?.paymentTiming ?? "PAY_BEFORE";

  return (
    <SettingsSection 
      title={t('title')} 
      description={t('desc')}
      icon={Zap}
    >
      <SettingsListBlock>
        <SettingsListRow cols={2}>
          <div className="space-y-4">
            <SettingsLabel>{t('service_model')}</SettingsLabel>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: "STALL_KIOSK", label: t('stall_kiosk.label'), desc: t('stall_kiosk.desc') },
                { id: "DINE_IN_TABLE", label: t('dine_in.label'), desc: t('dine_in.desc') },
              ].map((model) => (
                <div 
                  key={model.id} 
                  onClick={() => isEditing && updateLocalData({ serviceModel: model.id } as any)}
                  className={cn(
                    "p-5 rounded-2xl border transition-all flex items-center justify-between",
                    isEditing ? "cursor-pointer group" : "opacity-50 cursor-default",
                    serviceModel === model.id ? "bg-white border-primary ring-1 ring-primary/20" : "bg-white border-zinc-100 hover:border-zinc-200"
                  )}
                >
                  <div>
                    <p className="text-[14px] font-normal text-zinc-950">{model.label}</p>
                    <p className="text-[11px] font-normal text-zinc-400 mt-1">{model.desc}</p>
                  </div>
                  <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", serviceModel === model.id ? "border-primary" : "border-zinc-200")}>
                    {serviceModel === model.id && <div className="w-2.5 h-2.5 bg-primary rounded-full" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="space-y-4">
            <SettingsLabel>{t('payment_timing')}</SettingsLabel>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: "PAY_BEFORE", label: t('pay_before.label'), desc: t('pay_before.desc') },
                { id: "PAY_AFTER", label: t('pay_after.label'), desc: t('pay_after.desc') },
              ].map((timing) => (
                <div 
                  key={timing.id} 
                  onClick={() => isEditing && updateLocalData({ settings: { paymentTiming: timing.id } } as any)}
                  className={cn(
                    "p-5 rounded-2xl border transition-all flex items-center justify-between",
                    isEditing ? "cursor-pointer group" : "opacity-50 cursor-default",
                    paymentTiming === timing.id ? "bg-white border-primary ring-1 ring-primary/20" : "bg-white border-zinc-100 hover:border-zinc-200"
                  )}
                >
                  <div>
                    <p className="text-[14px] font-normal text-zinc-950">{timing.label}</p>
                    <p className="text-[11px] font-normal text-zinc-400 mt-1">{timing.desc}</p>
                  </div>
                  <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", paymentTiming === timing.id ? "border-primary" : "border-zinc-200")}>
                    {paymentTiming === timing.id && <div className="w-2.5 h-2.5 bg-primary rounded-full" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SettingsListRow>

        <SettingsListRow>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-primary shadow-sm border border-zinc-100">
                <Zap size={22} />
              </div>
              <div>
                <p className="text-[15px] font-normal text-zinc-950 tracking-tight">{t('auto_accept.label')}</p>
                <p className="text-[12px] font-normal text-zinc-400 mt-1">{t('auto_accept.desc')}</p>
              </div>
            </div>
            <SettingsSwitch 
              checked={autoAccept} 
              onChange={(val) => updateLocalData({ settings: { autoAcceptOrders: val } } as any)} 
            />
          </div>
        </SettingsListRow>
      </SettingsListBlock>
    </SettingsSection>
  );
}
