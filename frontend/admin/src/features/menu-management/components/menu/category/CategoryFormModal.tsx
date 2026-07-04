"use client"

import { useEffect, useState, useRef } from "react"
import { useForm } from "react-hook-form"
import { Loader2, X, CloudUpload, Image as ImageIcon, Check } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useCategories } from "../../../hooks/useCategories"
import { useImages } from "../../../hooks/useImages"
import { MenuCategory, CategoryFormData } from "../../../types"
import { useTranslations } from "next-intl"

interface CategoryFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editTarget: MenuCategory | null
  onSuccess: () => void
}

const PRESET_ICONS = [
  { name: "Breakfast", url: "/icons/breakfast.png" },
  { name: "Noodle", url: "/icons/noodle.png" },
  { name: "Spaghetti", url: "/icons/speghetii.png" },
  { name: "Catalog", url: "/icons/all.png" },
  { name: "Dessert", url: "/icons/Nhaem.jpg" },
  { name: "Breakfast Alt", url: "/icons/breakfast.jpg" },
  { name: "Icon A", url: "/icons/7591040d53207f4c2cdebaa0a5bdc2cd.jpg" },
  { name: "Icon B", url: "/icons/05886f318016c0c1ff98c9766d5b3a4d.jpg" },
  { name: "Icon C", url: "/icons/038d8191d273875a6202585c7017a067.jpg" },
]

export function CategoryFormModal({ open, onOpenChange, editTarget, onSuccess }: CategoryFormModalProps) {
  const isEdit = !!editTarget
  const { createCategory, updateCategory } = useCategories()
  const { uploadImageFile } = useImages()
  const t = useTranslations("category_form")

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CategoryFormData>({
    defaultValues: { nameEn: "", nameKm: "", isActive: true, sortOrder: 1, urlBanner: "" }
  })

  const [submitting, setSubmitting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const nameEn = watch("nameEn")
  const urlBanner = watch("urlBanner")

  // Pre-fill form when editing
  useEffect(() => {
    if (open) {
      if (editTarget) {
        reset({
          nameEn: editTarget.nameEn,
          nameKm: editTarget.nameKm || "",
          isActive: editTarget.isActive,
          sortOrder: editTarget.sortOrder,
          icon: editTarget.icon || "",
          urlBanner: editTarget.urlBanner || ""
        })
      } else {
        reset({
          nameEn: "",
          nameKm: "",
          isActive: true,
          sortOrder: 1,
          icon: "",
          urlBanner: ""
        })
      }
    }
  }, [editTarget, reset, open])

  // Handle Image Upload
  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    try {
      const url = await uploadImageFile(file)
      setValue("urlBanner", url)
    } catch (err) {
      console.error(err)
      alert("Failed to upload image")
    } finally {
      setUploadingImage(false)
    }
  }

  function handleRemoveImage() {
    setValue("urlBanner", "")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function handleSelectPreset(url: string) {
    setValue("urlBanner", url)
  }

  async function onSubmit(data: CategoryFormData) {
    setSubmitting(true)
    try {
      if (isEdit && editTarget) {
        await updateCategory(editTarget.id, data)
      } else {
        await createCategory(data)
      }
      onSuccess()
    } catch (error) {
      console.error(error)
      alert("Failed to save category")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[800px] w-full p-0 overflow-hidden border border-zinc-200 rounded-[20px] bg-white shadow-[0_40px_100px_rgba(0,0,0,0.12)]">
        
        {/* ZONE 1 — Header */}
        <DialogHeader className="relative px-8 pt-7 pb-5 border-b border-zinc-100 flex flex-row items-start justify-between">
          <div className="text-left">
            <DialogTitle className="text-[20px] font-semibold text-zinc-900 leading-none">
              {isEdit ? t('edit_category') : t('new_category')}
            </DialogTitle>
            <p className="text-[13px] text-zinc-400 mt-2 font-normal leading-tight">
              {t('new_category_desc')}
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-150 transition-colors"
          >
            <X size={16} />
          </button>
        </DialogHeader>

        {/* ZONE 2 — Two-Section Horizontal Form Fields */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[68vh] overflow-y-auto no-scrollbar">
          
          {/* Left Column — Core Basic Fields */}
          <div className="space-y-6">
            <h3 className="text-[14px] font-semibold text-zinc-800 border-b border-zinc-50 pb-2">{t('basic_info')}</h3>

            {/* Field 1 — Category Name English */}
            <div className="space-y-2 text-left">
              <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-0.5">
                {t('name_en')} <span className="text-rose-500">*</span>
              </Label>
              <input
                {...register("nameEn", { required: true })}
                placeholder="e.g. Beverages, Breakfast, Desserts"
                className={`w-full h-[40px] px-3.5 border rounded-xl text-[13px] font-normal placeholder-zinc-400 bg-white transition-all outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10 ${
                  errors.nameEn ? "border-rose-500" : "border-zinc-200"
                }`}
              />
              {errors.nameEn && (
                <p className="text-[11px] text-rose-500 mt-1 font-medium">{t('name_required')}</p>
              )}
            </div>

            {/* Field 2 — Category Name Khmer */}
            <div className="space-y-2 text-left">
              <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-1">
                {t('name_km')} <span className="text-zinc-400 font-normal">{t('optional')}</span>
              </Label>
              <input
                {...register("nameKm")}
                placeholder="ឧ. ភេសជ្ជៈ, អាហារព្រឹក"
                className="w-full h-[40px] px-3.5 border border-zinc-200 rounded-xl text-[13px] font-normal placeholder-zinc-400 bg-white transition-all outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10"
              />
            </div>

            {/* Field 3 — Sort Order */}
            <div className="space-y-2 text-left">
              <Label className="text-[12px] font-semibold text-zinc-500">{t('sort_order')}</Label>
              <input
                type="number"
                min="1"
                {...register("sortOrder", { valueAsNumber: true })}
                className="w-[100px] h-[40px] px-3.5 border border-zinc-200 rounded-xl text-[13px] font-normal bg-white outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10"
              />
              <p className="text-[11px] text-zinc-400 leading-normal font-normal">
                {t('sort_desc')}
              </p>
            </div>

            {/* Field 4 — Active Status Toggle */}
            <div className="flex items-center justify-between py-3 px-4 rounded-2xl bg-zinc-50/50 border border-zinc-100">
              <div className="text-left">
                <Label className="text-[13px] font-semibold text-zinc-700">{t('active_status')}</Label>
                <p className="text-[11px] text-zinc-400 mt-0.5 font-normal">
                  {t('active_desc')}
                </p>
              </div>
              <Switch
                checked={watch("isActive")}
                onCheckedChange={(v) => setValue("isActive", v)}
                className="data-[state=checked]:bg-[var(--color-brand)] data-[state=unchecked]:bg-zinc-200"
              />
            </div>
          </div>

          {/* Right Column — Banner Photo & Preset Icons Selection */}
          <div className="space-y-6">
            <h3 className="text-[14px] font-semibold text-zinc-800 border-b border-zinc-50 pb-2">{t('image_presets')}</h3>

            {/* Category Image Preview / Dropzone */}
            <div className="space-y-2 text-left">
              <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-1">
                {t('category_image')} <span className="text-zinc-400 font-normal">{t('optional')}</span>
              </Label>

              {urlBanner ? (
                <div className="relative w-full h-[200px] rounded-2xl overflow-hidden border border-zinc-200 group bg-zinc-50 shadow-inner">
                  <img
                    src={urlBanner}
                    alt="Category Banner"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="h-8 px-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-medium text-xs shadow-md transition-transform active:scale-95 flex items-center gap-1"
                    >
                      <X size={14} /> {t('remove_image')}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-[200px] border-[1.5px] border-dashed border-zinc-200 hover:border-zinc-300 rounded-2xl flex flex-col items-center justify-center bg-zinc-50/30 hover:bg-zinc-50 transition-colors cursor-pointer group select-none shadow-inner"
                >
                  {uploadingImage ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 text-[var(--color-brand)] animate-spin" />
                      <span className="text-xs text-zinc-450 font-semibold">{t('uploading')}</span>
                    </div>
                  ) : (
                    <>
                      <CloudUpload className="w-6 h-6 text-zinc-450 mb-1.5 group-hover:scale-105 transition-transform" />
                      <span className="text-[12px] text-zinc-650 font-semibold">{t('upload_custom')}</span>
                      <span className="text-[10px] text-zinc-400 mt-1">{t('upload_limit')}</span>
                    </>
                  )}
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleImageChange}
                className="hidden"
              />
            </div>

            {/* Static Preset Icons Library */}
            <div className="space-y-3 text-left">
              <Label className="text-[12px] font-semibold text-zinc-500">
                {t('select_preset')}
              </Label>
              <div className="grid grid-cols-4 gap-4 p-4 border border-zinc-150/70 rounded-2xl bg-zinc-50/20 max-h-[170px] overflow-y-auto no-scrollbar">
                {PRESET_ICONS.map((preset) => {
                  const isSelected = urlBanner === preset.url
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleSelectPreset(preset.url)}
                      className={`relative aspect-square transition-all duration-300 active:scale-[0.90] flex items-center justify-center group bg-transparent ${
                        isSelected 
                          ? "scale-105 filter drop-shadow-[0_10px_20px_rgba(232,96,28,0.28)]" 
                          : "hover:scale-110 filter hover:drop-shadow-[0_10px_20px_rgba(0,0,0,0.12)]"
                      }`}
                      title={preset.name}
                    >
                      <img 
                        src={preset.url} 
                        className="w-full h-full object-contain transition-transform duration-200" 
                        alt={preset.name} 
                      />
                      {isSelected && (
                        <div className="absolute -top-1.5 -right-1.5 z-10 w-5.5 h-5.5 rounded-full bg-[var(--color-brand)] text-white flex items-center justify-center shadow-lg border-2 border-white animate-scaleIn">
                          <Check size={11} strokeWidth={3.5} />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

          </div>

        </form>

        {/* ZONE 3 — Footer */}
        <DialogFooter className="px-8 py-5 border-t border-zinc-100 flex flex-row items-center justify-end gap-2.5 bg-zinc-50/20">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-[40px] px-5 rounded-xl text-[13px] font-medium text-white bg-rose-500 hover:bg-rose-600 border-0 shadow-sm transition-colors"
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={submitting || !nameEn}
            className="h-[40px] px-5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-[13px] rounded-xl border-0 shadow-sm transition-colors"
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {isEdit ? t('saving') : t('creating')}
              </span>
            ) : (
              isEdit ? t('save_changes') : t('create_category')
            )}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}
