import React from "react";
import { MapPin } from "lucide-react";
import { SettingsSection } from "./shared/SettingsSection";
import { SettingsLabel } from "./shared/SettingsLabel";
import { SettingsInput } from "./shared/SettingsInput";
import { useSettingsContext } from "./shared/SettingsContext";
import { SettingsListBlock, SettingsListRow } from "./shared/SettingsListBlock";

import { useTranslations } from "next-intl";

export function LocationSettings() {
  const t = useTranslations("settings.location");
  const { isEditing, data, updateLocalData } = useSettingsContext();
  const address = (data?.settings?.address as any) || {};

  const handleAddressChange = (field: string, value: string) => {
    updateLocalData({
      settings: {
        ...data?.settings,
        address: {
          ...address,
          [field]: value
        }
      } as any
    });
  };

  return (
    <SettingsSection 
      title={t('title')} 
      description={t('desc')}
      icon={MapPin}
    >
      <div className="space-y-6 max-w-4xl">
        <SettingsLabel className="text-[15px] font-medium ml-1">{t('mailing_address')}</SettingsLabel>
        <SettingsListBlock>
          <SettingsListRow>
            <div className="space-y-3">
              <SettingsLabel>{t('street_en')}</SettingsLabel>
              <SettingsInput 
                placeholder="House/Street info..." 
                value={address.streetEn || ""}
                onChange={(e) => handleAddressChange('streetEn', e.target.value)}
              />
            </div>
          </SettingsListRow>
          <SettingsListRow>
            <div className="space-y-3">
              <SettingsLabel>{t('street_km')}</SettingsLabel>
              <SettingsInput 
                placeholder="ព័ត៌មានផ្លូវ/ផ្ទះ..." 
                value={address.streetKm || ""}
                onChange={(e) => handleAddressChange('streetKm', e.target.value)}
              />
            </div>
          </SettingsListRow>
          <SettingsListRow cols={2}>
            <div className="space-y-3">
              <SettingsLabel>{t('commune')}</SettingsLabel>
              <SettingsInput 
                value={address.commune || ""}
                onChange={(e) => handleAddressChange('commune', e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <SettingsLabel>{t('district')}</SettingsLabel>
              <SettingsInput 
                value={address.district || ""}
                onChange={(e) => handleAddressChange('district', e.target.value)}
              />
            </div>
          </SettingsListRow>
          <SettingsListRow>
            <div className="space-y-3">
              <SettingsLabel>{t('city')}</SettingsLabel>
              <SettingsInput 
                value={address.city || ""}
                onChange={(e) => handleAddressChange('city', e.target.value)}
              />
            </div>
          </SettingsListRow>
        </SettingsListBlock>
      </div>
    </SettingsSection>
  );
}
