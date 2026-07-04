import React from "react";
import { CreditCard, Store, Globe, ChevronRight } from "lucide-react";
import { SettingsSection } from "./shared/SettingsSection";
import { SettingsLabel } from "./shared/SettingsLabel";
import { cn } from "@/lib/utils/cn";
import { useSettingsContext } from "./shared/SettingsContext";
import { SettingsListBlock, SettingsListRow } from "./shared/SettingsListBlock";
import { SettingsSwitch } from "./shared/SettingsSwitch";

import { useTranslations } from "next-intl";

export function PaymentMethods() {
  const t = useTranslations("settings.payments");
  const { isEditing, data, updateLocalData } = useSettingsContext();

  const methods = [
    { id: "CASH", method: t('cash'), provider: "Manual", icon: Store, desc: t('cash_desc') },
    { id: "ABA_QR", method: t('aba'), provider: "ABA PayWay", icon: CreditCard, desc: t('aba_desc') },
    { id: "CARD", method: t('card'), provider: "Integration", icon: Globe, desc: t('card_desc') },
  ];

  return (
    <SettingsSection 
      title={t('title')} 
      description={t('desc')}
      icon={CreditCard}
    >
      <SettingsListBlock>
        {methods.map((p) => {
          const methodRecord = data?.paymentMethods?.find((m: any) => m.method === p.id);
          const isEnabled = methodRecord?.isEnabled ?? false;

          const handleToggle = () => {
            if (!isEditing) return;
            const updatedMethods = [...(data?.paymentMethods || [])];
            const index = updatedMethods.findIndex(m => m.method === p.id);

            if (index > -1) {
              updatedMethods[index] = { ...updatedMethods[index], isEnabled: !isEnabled };
            } else {
              updatedMethods.push({
                id: `temp-${p.id}`,
                method: p.id,
                provider: p.id === "CASH" ? null : "ABA PayWay",
                isEnabled: true
              });
            }
            updateLocalData({ paymentMethods: updatedMethods });
          };

          return (
            <SettingsListRow key={p.id}>
              <div className="flex items-center gap-5 w-full">
                <div className={cn(
                  "w-12 h-12 rounded-[18px] flex items-center justify-center transition-all shrink-0 shadow-sm border border-zinc-50",
                  isEnabled ? "bg-white text-primary" : "bg-zinc-50 text-zinc-300"
                )}>
                  <p.icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-[14px] font-medium text-zinc-950">{p.method}</h4>
                    <span className="px-1.5 py-0.5 bg-zinc-50 text-zinc-400 rounded-md text-[9px] font-normaltracking-wider">{p.provider}</span>
                  </div>
                  <p className="text-[12px] font-normal text-zinc-400 mt-0.5 truncate">{p.desc}</p>
                </div>
                <div className="flex items-center gap-4">
                  {isEnabled && isEditing && (
                    <button className="flex items-center gap-1 text-[13px] font-normal text-zinc-400 hover:text-zinc-950 transition-colors">
                      {t('manage')} <ChevronRight size={14} />
                    </button>
                  )}
                  <SettingsSwitch 
                    checked={isEnabled} 
                    onChange={handleToggle} 
                  />
                </div>
              </div>
            </SettingsListRow>
          );
        })}
      </SettingsListBlock>
    </SettingsSection>
  );
}
