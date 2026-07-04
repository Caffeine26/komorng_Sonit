import React from "react";
import { Phone, Send, MessageSquare, Plus, Trash2, Share2, ChevronRight, Store } from "lucide-react";
import { SettingsSection } from "./shared/SettingsSection";
import { SettingsLabel } from "./shared/SettingsLabel";
import { SettingsListBlock, SettingsListRow } from "./shared/SettingsListBlock";
import { SettingsInput } from "./shared/SettingsInput";
import { useSettingsContext } from "./shared/SettingsContext";

import { useTranslations } from "next-intl";

export function ContactSettings() {
  const t = useTranslations("settings.contacts");
  const { isEditing, data, updateLocalData } = useSettingsContext();
  
  const phone = data?.settings?.phone || "";
  const socialLinks = (data?.settings?.socialLinks as any) || {};

  const handleSocialChange = (key: string, value: string) => {
    updateLocalData({
      settings: {
        ...data?.settings,
        socialLinks: {
          ...socialLinks,
          [key]: value
        }
      } as any
    });
  };

  return (
    <SettingsSection
      title={t('title')}
      description={t('desc')}
      icon={Phone}
    >
      <SettingsListBlock>
        <SettingsListRow>
          <SettingsLabel className="text-[15px] font-medium">{t('social_presence')}</SettingsLabel>
        </SettingsListRow>

        <SettingsListRow cols={2}>
          <div className="space-y-3">
            <SettingsLabel>{t('phone')}</SettingsLabel>
            <SettingsInput 
              value={phone}
              onChange={(e) => updateLocalData({ settings: { ...data?.settings, phone: e.target.value } as any })}
              placeholder="+855 12 345 678"
              prefix={<div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 mr-2"><Phone size={18} /></div>}
            />
          </div>
          <div className="space-y-3">
            <SettingsLabel>{t('facebook')}</SettingsLabel>
            <SettingsInput 
              placeholder="facebook.com/username"
              value={data?.settings?.facebookUrl || socialLinks?.facebook || ""}
              onChange={(e) => updateLocalData({ settings: { ...data?.settings, facebookUrl: e.target.value } as any })}
              prefix={<div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 mr-2"><Store size={18} /></div>}
            />
          </div>
        </SettingsListRow>

        <SettingsListRow cols={2}>
          <div className="space-y-3">
            <SettingsLabel>{t('telegram')}</SettingsLabel>
            <SettingsInput 
              value={socialLinks.telegram || ""}
              onChange={(e) => handleSocialChange('telegram', e.target.value)}
              placeholder="@komorng_shop"
              prefix={<div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 mr-2"><Send size={18} /></div>}
            />
          </div>
          <div className="space-y-3">
            <SettingsLabel>{t('instagram')}</SettingsLabel>
            <SettingsInput 
              value={socialLinks.instagram || ""}
              onChange={(e) => handleSocialChange('instagram', e.target.value)}
              placeholder="@komorng.store"
              prefix={<div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 mr-2"><Share2 size={18} /></div>}
            />
          </div>
        </SettingsListRow>

        <SettingsListRow cols={2}>
          <div className="space-y-3">
            <SettingsLabel>{t('messenger')}</SettingsLabel>
            <SettingsInput 
              value={socialLinks.messenger || ""}
              onChange={(e) => handleSocialChange('messenger', e.target.value)}
              placeholder="KomorngStore"
              prefix={<div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 mr-2"><MessageSquare size={18} /></div>}
            />
          </div>
          <div />
        </SettingsListRow>
      </SettingsListBlock>
    </SettingsSection>
  );
}
