import React from "react";
import { Globe } from "lucide-react";
import { SettingsSection } from "./shared/SettingsSection";
import { SettingsLabel } from "./shared/SettingsLabel";
import { SettingsInput } from "./shared/SettingsInput";
import { SettingsSelect } from "./shared/SettingsSelect";
import { SettingsListBlock, SettingsListRow } from "./shared/SettingsListBlock";
import { SettingsSwitch } from "./shared/SettingsSwitch";
import { useSettingsContext } from "./shared/SettingsContext";

import { useTranslations } from "next-intl";

export function LocalizationSettings() {
  const t = useTranslations("settings.localization");
  const { isEditing, data, updateLocalData } = useSettingsContext();

  const currentLocale = data?.settings?.defaultLocale ?? "en";
  const currentCurrency = data?.settings?.currency ?? "USD";
  const currentTimezone = data?.settings?.timezone ?? "Asia/Phnom_Penh";
  const currentTaxRate = data?.settings?.taxRateBps ? data.settings.taxRateBps / 100 : 10;
  const currentTaxInclusive = data?.settings?.taxInclusive ?? true;

  return (
    <SettingsSection 
      title={t('title')} 
      description={t('desc')}
      icon={Globe}
    >
      <SettingsListBlock>
        <SettingsListRow cols={2}>
          <div className="space-y-3">
            <SettingsLabel>{t('language')}</SettingsLabel>
            <SettingsSelect
              value={currentLocale}
              onChange={(e) => updateLocalData({ settings: { defaultLocale: e.target.value } } as any)}
            >
              <option value="en">English (United States)</option>
              <option value="km">Khmer (Cambodia)</option>
            </SettingsSelect>
          </div>
          <div className="space-y-3">
            <SettingsLabel>{t('currency')}</SettingsLabel>
            <SettingsSelect
              value={currentCurrency}
              onChange={(e) => updateLocalData({ settings: { currency: e.target.value } } as any)}
            >
              <option value="USD">USD - US dollar</option>
              <option value="KHR">KHR - Cambodian riel</option>
            </SettingsSelect>
          </div>
        </SettingsListRow>

        <SettingsListRow cols={2}>
          <div className="space-y-3">
            <SettingsLabel>{t('timezone')}</SettingsLabel>
            <SettingsSelect
              value={currentTimezone}
              onChange={(e) => updateLocalData({ settings: { timezone: e.target.value } } as any)}
            >
              <option value="Asia/Phnom_Penh">(GMT+07:00) Phnom Penh</option>
              <option value="Asia/Bangkok">(GMT+07:00) Bangkok</option>
              <option value="Asia/Singapore">(GMT+08:00) Singapore</option>
            </SettingsSelect>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <SettingsLabel>{t('tax_rate')}</SettingsLabel>
              <SettingsInput 
                type="number" 
                step="0.1" 
                value={currentTaxRate}
                onChange={(e) => updateLocalData({ settings: { taxRateBps: Math.round(parseFloat(e.target.value) * 100) } } as any)}
              />
            </div>
            <div className="flex flex-col justify-center gap-3 pt-6 ml-2">
              <div className="flex items-center gap-3">
                <SettingsSwitch 
                  checked={currentTaxInclusive} 
                  onChange={(val) => updateLocalData({ settings: { taxInclusive: val } } as any)}
                />
                <span className="text-[13px] font-normal text-zinc-950">{t('tax_inclusive')}</span>
              </div>
            </div>
          </div>
        </SettingsListRow>
      </SettingsListBlock>
    </SettingsSection>
  );
}
