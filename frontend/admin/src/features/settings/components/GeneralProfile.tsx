import React, { useRef, useState } from "react";
import { Store, Upload, Loader2, Trash } from "lucide-react";
import { SettingsSection } from "./shared/SettingsSection";
import { SettingsLabel } from "./shared/SettingsLabel";
import { SettingsInput } from "./shared/SettingsInput";
import { SettingsTextarea } from "./shared/SettingsTextarea";
import { SettingsListBlock, SettingsListRow } from "./shared/SettingsListBlock";
import { useSettingsContext } from "./shared/SettingsContext";
import { useTranslations } from "next-intl";
import { uploadMenuItemImage } from "@/lib/api/menu";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { resolveMediaUrl } from "@/lib/utils/media-url";
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog";

export function GeneralProfile() {
  const t = useTranslations("settings.general");
  const { data, isLoading, updateLocalData, isEditing } = useSettingsContext();
  const { tenantSlug } = useParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 w-48 bg-zinc-100 rounded-lg" />
        <div className="space-y-4">
          <div className="h-24 w-full bg-zinc-50 rounded-2xl" />
          <div className="h-24 w-full bg-zinc-50 rounded-2xl" />
        </div>
      </div>
    );
  }

  const handleLogoClick = () => {
    if (!isEditing || isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        updateLocalData({
          settings: {
            ...data?.settings,
            logoUrl: base64
          } as any
        });
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg("Failed to read image file.");
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) return;
    updateLocalData({
      settings: {
        ...data?.settings,
        logoUrl: null
      } as any
    });
  };

  return (
    <SettingsSection
      title={t("title")}
      description={t("desc")}
      icon={Store}
    >
      <SettingsListBlock>
        <div className="p-6 border-b border-zinc-100 flex flex-col md:flex-row items-center gap-6">
          <div 
            onClick={handleLogoClick}
            className={cn(
              "w-24 h-24 rounded-3xl border border-zinc-200 bg-zinc-50/50 flex flex-col items-center justify-center relative overflow-hidden transition-all shadow-sm shrink-0",
              isEditing && "hover:border-primary/50 hover:bg-white cursor-pointer active:scale-95"
            )}
          >
            {isUploading ? (
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            ) : data?.settings?.logoUrl ? (
              <>
                <img 
                  src={resolveMediaUrl(data.settings.logoUrl)} 
                  alt="Store Logo" 
                  className="w-full h-full object-cover"
                />
                {isEditing && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Upload className="w-5 h-5 text-white" />
                    <button 
                      onClick={handleRemoveLogo}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                    >
                      <Trash className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center p-3 flex flex-col items-center gap-1">
                <Store className="w-6 h-6 text-zinc-400 group-hover:text-primary" />
                {isEditing && <span className="text-[10px] font-medium text-zinc-500">Upload</span>}
              </div>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>
          <div className="flex-1 space-y-1 text-center md:text-left">
            <h3 className="text-[15px] font-medium text-zinc-950">Store Logo</h3>
            <p className="text-[12px] text-zinc-500 max-w-sm">
              {isEditing 
                ? "Click on the box to upload a high-quality PNG or JPG logo. Recommended size: 256x256 pixels."
                : "The active branding logo of your digital storefront and admin dashboard sidebar."}
            </p>
          </div>
        </div>

        <SettingsListRow cols={2}>
          <div className="space-y-3">
            <SettingsLabel>{t("name_en")}</SettingsLabel>
            <SettingsInput 
              placeholder="e.g. Sovanaphum"
              value={data?.nameEn || data?.name || ""} 
              onChange={(e) => updateLocalData({ 
                nameEn: e.target.value,
                name: e.target.value 
              } as any)}
            />
          </div>
          <div className="space-y-3">
            <SettingsLabel>{t("name_km")}</SettingsLabel>
            <SettingsInput 
              placeholder="ឧទាញណ៍៖ សុវណ្ណភូមិ"
              value={(data as any)?.nameKm || ""} 
              onChange={(e) => updateLocalData({ nameKm: e.target.value } as any)}
            />
          </div>
          <div className="space-y-3">
            <SettingsLabel>{t("slug")}</SettingsLabel>
            <SettingsInput
              prefix="komorng.com/o/"
              value={data?.slug || ""}
              onChange={(e) => updateLocalData({ slug: e.target.value })}
            />
          </div>
          <div className="space-y-3">
            <SettingsLabel hint={t("prefix_hint")}>{t("prefix")}</SettingsLabel>
            <SettingsInput
              placeholder="e.g. KMS"
              value={(data as any)?.codePrefix || ""}
              onChange={(e) => updateLocalData({ codePrefix: e.target.value } as any)}
              maxLength={4}
            />
          </div>
        </SettingsListRow>

        <SettingsListRow>
          <SettingsLabel>{t("description")}</SettingsLabel>
          <SettingsTextarea 
            placeholder={t("description_placeholder")} 
            value={data?.settings?.description as string || ""}
            onChange={(e) => updateLocalData({ 
              settings: { description: e.target.value } as any 
            })}
          />
        </SettingsListRow>
      </SettingsListBlock>
      
      <GlobalActionDialog
        isOpen={!!errorMsg}
        title="Error"
        description={errorMsg || ""}
        confirmLabel="OK"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
        variant="DESTRUCTIVE"
      />
    </SettingsSection>
  );
}
