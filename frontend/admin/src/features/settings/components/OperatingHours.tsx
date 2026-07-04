import React from "react";
import { Clock } from "lucide-react";
import { SettingsSection } from "./shared/SettingsSection";
import { SettingsLabel } from "./shared/SettingsLabel";
import { SettingsInput } from "./shared/SettingsInput";
import { useSettingsContext } from "./shared/SettingsContext";
import { SettingsListBlock, SettingsListRow } from "./shared/SettingsListBlock";
import { SettingsSwitch } from "./shared/SettingsSwitch";
import { cn } from "@/lib/utils/cn";

import { useTranslations } from "next-intl";

export function OperatingHours() {
  const t = useTranslations("settings.hours");
  const { isEditing, data, updateLocalData } = useSettingsContext();
  const days = [0, 1, 2, 3, 4, 5, 6];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <SettingsSection
      title={t('title')}
      description={t('desc')}
      icon={Clock}
    >
      <SettingsListBlock>
        <SettingsListRow className="bg-zinc-50/30 border-b border-zinc-100 py-2">
          <div className="flex items-center w-full px-4 gap-4">
            <span className="flex-1 text-[11px] font-medium text-zinc-400tracking-wider">{t('day')}</span>
            <span className="w-16 text-[11px] font-medium text-zinc-400tracking-wider">{t('status')}</span>
            <span className="w-36 text-[11px] font-medium text-zinc-400tracking-wider">{t('hours')}</span>
          </div>
        </SettingsListRow>

        {days.map((dayNum) => {
          const hourRecord = data?.operatingHours?.find((h: any) => h.dayOfWeek === dayNum);
          const isClosed = hourRecord?.isClosed ?? false;
          
          const handleToggle = () => {
            if (!isEditing) return;
            const updatedHours = [...(data?.operatingHours || [])];
            const index = updatedHours.findIndex(h => h.dayOfWeek === dayNum);
            
            if (index > -1) {
              updatedHours[index] = { ...updatedHours[index], isClosed: !isClosed };
            } else {
              // Create default record if not exists
              updatedHours.push({
                id: `temp-${dayNum}`,
                dayOfWeek: dayNum,
                openTime: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
                closeTime: new Date(new Date().setHours(22, 0, 0, 0)).toISOString(),
                isClosed: true
              });
            }
            updateLocalData({ operatingHours: updatedHours });
          };

          return (
            <SettingsListRow key={dayNum} className="py-3">
              <div className="flex items-center w-full px-4 gap-4">
                <span className="flex-1 text-[14px] font-normal text-zinc-950">{dayNames[dayNum]}</span>

                <div className="w-16 flex items-center">
                  <SettingsSwitch 
                    checked={!isClosed} 
                    onChange={handleToggle} 
                  />
                </div>

                <div className="w-48">
                  <SettingsInput
                    value={isClosed ? "--:-- - --:--" : `${hourRecord?.openTime?.substring(11, 16) || "08:00"} - ${hourRecord?.closeTime?.substring(11, 16) || "22:00"}`}
                    disabled={!isEditing || isClosed}
                    onChange={(e) => {
                      const val = e.target.value;
                      const parts = val.split("-").map(p => p.trim());
                      if (parts.length === 2 && parts[0].length === 5 && parts[1].length === 5) {
                        const updatedHours = [...(data?.operatingHours || [])];
                        const index = updatedHours.findIndex(h => h.dayOfWeek === dayNum);
                        if (index > -1) {
                          const today = new Date().toISOString().split('T')[0];
                          updatedHours[index] = { 
                            ...updatedHours[index], 
                            openTime: `${today}T${parts[0]}:00.000Z`,
                            closeTime: `${today}T${parts[1]}:00.000Z`
                          };
                          updateLocalData({ operatingHours: updatedHours });
                        }
                      }
                    }}
                    className="h-9 px-3 rounded-lg text-[13px]"
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
