import React from "react";
import { Palette, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { SettingsSection } from "./shared/SettingsSection";
import { SettingsLabel } from "./shared/SettingsLabel";
import { cn } from "@/lib/utils/cn";
import { useSettingsContext } from "./shared/SettingsContext";
import { SettingsListBlock, SettingsListRow } from "./shared/SettingsListBlock";

import { useTranslations } from "next-intl";

export function AppearanceSettings() {
  const t = useTranslations("settings.appearance");
  const { data, isEditing, updateLocalData } = useSettingsContext();
  const activeColor = data?.settings?.primaryColor || "#E91E63";

  const handleColorSelect = (hex: string) => {
    if (!isEditing) return;
    updateLocalData({ 
      settings: { 
        ...data?.settings,
        primaryColor: hex 
      } as any 
    });
  };

  return (
    <SettingsSection
      title={t("title")}
      description={t("desc")}
      icon={Palette}
    >
      <SettingsListBlock>
        <SettingsListRow>
          <div className="space-y-6">
            <SettingsLabel>{t("theme_color")}</SettingsLabel>
            <div className="flex flex-wrap gap-4">
              {[
                { name: t("colors.default"), hex: "#E91E63" },
                { name: t("colors.saffron"), hex: "#FF7D54" },
                { name: t("colors.emerald"), hex: "#34C759" },
                { name: t("colors.azure"), hex: "#007AFF" },
                { name: t("colors.midnight"), hex: "#18181b" },
              ].map((color) => (
                <div 
                  key={color.hex} 
                  onClick={() => handleColorSelect(color.hex)}
                  className={cn("flex flex-col items-center gap-3 transition-all", isEditing ? "group cursor-pointer hover:scale-105 active:scale-95" : "opacity-50 cursor-default")}
                >
                  <div
                    className={cn(
                      "w-12 h-12 sm:w-16 sm:h-16 rounded-[18px] sm:rounded-[24px] border-4 transition-all flex items-center justify-center",
                      color.hex === activeColor ? "border-zinc-900 ring-4 ring-zinc-950/5" : "border-white"
                    )}
                    style={{ backgroundColor: color.hex }}
                  >
                    {color.hex === activeColor && <CheckCircle2 size={20} className="text-white" />}
                  </div>
                  <span className={cn("text-[11px] font-normal transition-colors", color.hex === activeColor ? "text-zinc-950" : "text-zinc-400 group-hover:text-zinc-950")}>{color.name}</span>
                </div>
              ))}
            </div>
          </div>
        </SettingsListRow>

        <SettingsListRow cols={2}>
          <div className="space-y-3">
            <SettingsLabel>{t("store_logo")}</SettingsLabel>
            <div className={cn("w-full aspect-square bg-white border rounded-[32px] flex flex-col items-center justify-center gap-3 transition-all",
              isEditing ? "border-dashed border-zinc-200 group cursor-pointer hover:border-zinc-300 hover:bg-zinc-50/50" : "border-solid border-zinc-100 opacity-50 cursor-default")}>
              <div className="w-10 h-10 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-300 group-hover:text-primary transition-all">
                <ImageIcon size={20} />
              </div>
              <p className="text-[13px] font-normal text-zinc-950">{t("upload_logo")}</p>
              <p className="text-[11px] font-normal text-zinc-400">{t("logo_hint")}</p>
            </div>
          </div>
          <div className="space-y-3">
            <SettingsLabel>{t("store_banner")}</SettingsLabel>
            <div className={cn("w-full aspect-square bg-white border rounded-[32px] flex flex-col items-center justify-center gap-3 transition-all",
              isEditing ? "border-dashed border-zinc-200 group cursor-pointer hover:border-zinc-300 hover:bg-zinc-50/50" : "border-solid border-zinc-100 opacity-50 cursor-default")}>
              <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-300 group-hover:text-primary transition-all">
                <ImageIcon size={24} />
              </div>
              <p className="text-[13px] font-normal text-zinc-950">{t("upload_banner")}</p>
              <p className="text-[11px] font-normal text-zinc-400">{t("banner_hint")}</p>
            </div>
          </div>
        </SettingsListRow>
      </SettingsListBlock>
    </SettingsSection>
  );
}
