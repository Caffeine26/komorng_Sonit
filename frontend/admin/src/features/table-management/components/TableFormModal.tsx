"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Users, QrCode, Image as ImageIcon, Table, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useTables } from "../hooks/use-tables";
import { useTranslations } from "next-intl";
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog";

interface TableFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  initialData?: any;
}

export const TableFormModal = ({ isOpen, onClose, onSubmit, initialData }: TableFormModalProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const params = useParams();
  const tenantSlug = (params?.tenantSlug as string) || '';
  const t = useTranslations("table_form");

  const [formData, setFormData] = useState({
    name: "",
    capacity: "",
    image: "",
  });

  const { uploadImage } = useTables();
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({ 
        name: initialData.name || "", 
        capacity: String(initialData.capacity || ""),
        image: initialData.image || ""
      });
    } else {
      setFormData({ name: "", capacity: "", image: "" });
    }
  }, [initialData, isOpen]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const url = await uploadImage(file);
      setFormData(prev => ({ ...prev, image: url }));
    } catch (err) {
      console.error('[Upload] Error:', err);
      setErrorMsg('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      {/* design_system.json has no overlay token — keeping arbitrary value */}
      <div
        className="absolute inset-0 bg-[var(--color-background-raised)]/80 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      {/* design_system.json has no exact token for 100px shadow — keeping arbitrary value */}
      <div className="relative w-full max-w-[560px] max-h-[92vh] bg-white rounded-[32px] sm:rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.1)] border border-white overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">

        {/* Header */}
        <div className="h-16 sm:h-20 flex items-center justify-between px-6 sm:px-8 border-b border-zinc-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
              <Table size={18} strokeWidth={1.5} />
            </div>
            <h2 className="text-[16px] sm:text-[18px] font-normal text-zinc-950 tracking-tight leading-none">
              {initialData ? t('edit_table') : t('create_table')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:bg-zinc-50 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-8 flex-1 overflow-y-auto">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(formData);
            }}
          >
            {/* Table Name */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <label className="text-[13px] font-medium text-zinc-700 w-[130px] shrink-0">{t('table_name')}</label>
              <div className="flex items-center flex-1 h-14 bg-white border border-zinc-100 rounded-2xl px-6 shadow-sm transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5">
                <div className="flex items-center justify-center shrink-0 text-zinc-950/60">
                  <Table size={18} />
                </div>
                <input
                  required
                  type="text"
                  placeholder={t('table_name_placeholder')}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="flex-1 w-full bg-transparent text-[14px] font-normal text-zinc-950 focus:outline-none ml-3"
                />
              </div>
            </div>

            {/* Seating Capacity */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <label className="text-[13px] font-medium text-zinc-700 w-[130px] shrink-0">{t('capacity')}</label>
              <div className="flex items-center flex-1 h-14 bg-white border border-zinc-100 rounded-2xl px-6 shadow-sm transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5">
                <div className="flex items-center justify-center shrink-0 text-zinc-950/60">
                  <Users size={18} />
                </div>
                <input
                  required
                  type="number"
                  placeholder={t('capacity_placeholder')}
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  className="flex-1 w-full bg-transparent text-[14px] font-normal text-zinc-950 focus:outline-none ml-3"
                />
              </div>
            </div>

            {/* Table Image Upload */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <label className="text-[13px] font-medium text-zinc-700 w-[130px] shrink-0 pt-4">{t('table_photo')}</label>
              <div className="flex-1 relative">
                <input 
                  type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "h-[140px] border border-dashed border-zinc-200 rounded-[32px] flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-zinc-100/50 transition-all group overflow-hidden relative",
                  formData.image ? "bg-white" : "bg-zinc-50/50"
                )}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={24} className="text-primary animate-spin" />
                    <p className="text-[12px] text-zinc-400">{t('uploading')}</p>
                  </div>
                ) : formData.image ? (
                  <>
                    <img 
                      src={formData.image} 
                      className="w-full h-full object-cover" 
                      alt="Table Preview" 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <span className="text-white text-[12px] font-medium">{t('change_photo')}</span>
                      <div className="w-px h-3 bg-white/20 mx-1" />
                      <span 
                        className="text-destructive text-[12px] font-medium hover:text-destructive/80 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData(prev => ({ ...prev, image: "" }));
                        }}
                      >
                        {t('remove')}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-zinc-350 group-hover:scale-110 transition-transform shadow-sm">
                      <ImageIcon size={20} />
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-normal text-zinc-950">{t('add_photo')}</p>
                      <p className="text-[11px] font-normal text-zinc-400 mt-0.5">{t('zone_detail')}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

            {/* QR Section */}
            <div className="p-5 bg-zinc-50/50 rounded-[28px] border border-zinc-100 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-zinc-950 shadow-sm">
                    <QrCode size={18} />
                  </div>
                  <div>
                    <p className="text-[14px] font-normal text-zinc-950">{t('auto_generate')}</p>
                    <p className="text-[11px] font-normal text-zinc-400 mt-0.5">{t('direct_access')}</p>
                  </div>
                </div>
                <div className="w-11 h-6 bg-emerald-500 rounded-full relative shadow-inner flex-shrink-0">
                  <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-200/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white border border-zinc-100 rounded-xl p-2 flex items-center justify-center shadow-sm">
                    <div className="w-full h-full bg-zinc-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {initialData?.qrToken ? (
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`${process.env.NEXT_PUBLIC_STOREFRONT_URL || window.location.origin}/${initialData.tenantSlug}?qr=${initialData.qrToken}`)}&ecc=M&margin=0&qzone=2`}
                          alt="QR Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <QrCode size={18} className="text-zinc-300" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[13px] font-normal text-zinc-950">{t('menu_access')}</p>
                    <p className="text-[11px] font-normal text-zinc-400 mt-0.5">{t('active_for')} {initialData?.name || t('this_table')}</p>
                  </div>
                </div>
                {initialData?.qrToken && (
                  <button 
                    type="button"
                    onClick={async () => {
                      const storefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL || window.location.origin;
                      const qrUrl = `${storefrontUrl}/${initialData.tenantSlug}?qr=${initialData.qrToken}`;
                      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(qrUrl)}&ecc=M&margin=0&qzone=2`;
                      try {
                        // EXCEPTION: This fetch() calls an external third-party QR service, not the backend API.
                        // It is intentionally not abstracted through lib/api/client.ts.
                        const response = await fetch(qrImageUrl);
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${(initialData.name || 'Table').replace(/\s+/g, '_')}_QR.png`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                      } catch (err) {
                        window.open(qrImageUrl, '_blank');
                      }
                    }}
                    className="h-10 px-5 bg-rose-500 text-white rounded-xl text-[12px] font-medium hover:bg-rose-600 transition-all cursor-pointer shadow-sm flex-shrink-0 active:scale-95"
                  >
                    {t('download_qr')}
                  </button>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-12 px-8 bg-zinc-50/50 text-zinc-950 rounded-[24px] text-[13px] font-normal hover:bg-zinc-100 transition-all cursor-pointer min-w-[120px]"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="h-12 flex-1 bg-primary text-white rounded-[24px] text-[14px] font-medium hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-primary/20"
              >
                {initialData ? t('update_btn') : t('create_btn')}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      <GlobalActionDialog
        isOpen={!!errorMsg}
        title="Error"
        description={errorMsg || ""}
        confirmLabel="OK"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />
    </div>
  );
};
