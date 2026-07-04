"use client"

import { useEffect, useState, useRef } from "react"
import { useForm } from "react-hook-form"
import { Loader2, X, CloudUpload } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PriceInput } from "../shared/PriceInput"
import { useItems } from "../../../hooks/useItems"
import { useImages } from "../../../hooks/useImages"
import { MenuItem, ItemFormData } from "../../../types"
import { useTranslations } from "next-intl"

interface ItemFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryId: string
  editTarget: MenuItem | null
  onSuccess: () => void
}

export function ItemFormModal({ open, onOpenChange, categoryId, editTarget, onSuccess }: ItemFormModalProps) {
  const isEdit = !!editTarget
  const { createItem, updateItem, items } = useItems(categoryId)
  const { uploadImageFile, createItemImage, deleteItemImage } = useImages()
  const t = useTranslations("item_form")
  const [submitting, setSubmitting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [imageUrl, setImageUrl] = useState<string>("")
  const [initialImageUrl, setInitialImageUrl] = useState<string>("")
  const [primaryImageId, setPrimaryImageId] = useState<string | null>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ItemFormData>({
    defaultValues: {
      nameEn: "",
      nameKm: "",
      descriptionEn: "",
      descriptionKm: "",
      basePriceCents: 0,
      costCents: 0,
      unit: "",
      sku: "",
      sortOrder: 1,
      isAvailable: true,
      isVisible: true
    }
  })

  const nameEn = watch("nameEn")
  const basePriceCents = watch("basePriceCents")
  const nextSortOrder = items.length > 0 ? Math.max(...items.map(item => item.sortOrder || 0)) + 1 : 1

  // Pre-fill form when editing
  useEffect(() => {
    if (open) {
      if (editTarget) {
        reset({
          nameEn: editTarget.nameEn,
          nameKm: editTarget.nameKm || "",
          descriptionEn: editTarget.descriptionEn || "",
          descriptionKm: editTarget.descriptionKm || "",
          basePriceCents: editTarget.basePriceCents,
          costCents: editTarget.costCents || 0,
          unit: editTarget.unit || "",
          sku: editTarget.sku || "",
          sortOrder: editTarget.sortOrder,
          isAvailable: editTarget.isAvailable,
          isVisible: editTarget.isVisible,
        })
        const primary = editTarget.primaryImage || editTarget.images?.find(img => img.isPrimary)
        if (primary) {
          setImageUrl(primary.imageUrl)
          setInitialImageUrl(primary.imageUrl)
          setPrimaryImageId(primary.id)
        } else {
          setImageUrl("")
          setInitialImageUrl("")
          setPrimaryImageId(null)
        }
      } else {
        reset({
          nameEn: "",
          nameKm: "",
          descriptionEn: "",
          descriptionKm: "",
          basePriceCents: 0,
          costCents: 0,
          unit: "",
          sku: "",
          sortOrder: nextSortOrder,
          isAvailable: true,
          isVisible: true
        })
        setImageUrl("")
        setInitialImageUrl("")
        setPrimaryImageId(null)
      }
    }
  }, [editTarget, reset, open, items, nextSortOrder])

  // Handle image S3 upload
  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    try {
      const url = await uploadImageFile(file)
      setImageUrl(url)
    } catch (err) {
      console.error(err)
      alert("Failed to upload product photo")
    } finally {
      setUploadingImage(false)
    }
  }

  // Handle direct image deletion inside form
  async function handleRemoveImage() {
    if (isEdit && editTarget && primaryImageId) {
      setUploadingImage(true)
      try {
        await deleteItemImage(editTarget.id, primaryImageId)
        setPrimaryImageId(null)
        setInitialImageUrl("")
      } catch (err) {
        console.error(err)
      } finally {
        setUploadingImage(false)
      }
    }
    setImageUrl("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  async function onSubmit(data: ItemFormData) {
    setSubmitting(true)
    try {
      const payload = {
        ...data,
        categoryId
      }

      if (isEdit && editTarget) {
        await updateItem(editTarget.id, payload)
        // If they uploaded a new image url
        if (imageUrl && imageUrl !== initialImageUrl) {
          // Clean up old image if existed
          if (primaryImageId) {
            try {
              await deleteItemImage(editTarget.id, primaryImageId)
            } catch (e) {
              console.warn("Clean up of old image failed, ignoring", e)
            }
          }
          await createItemImage(editTarget.id, imageUrl, true)
        }
      } else {
        const newItem = await createItem(payload)
        if (imageUrl) {
          await createItemImage(newItem.id, imageUrl, true)
        }
      }
      onSuccess()
    } catch (error) {
      console.error(error)
      alert("Failed to save product")
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
              {isEdit ? t('edit_product') : t('new_product')}
            </DialogTitle>
            <p className="text-[13px] text-zinc-400 mt-2 font-normal leading-tight">
              {t('new_product_desc')}
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
          
          {/* Left Column — Basic product detail fields */}
          <div className="space-y-5">
            <h3 className="text-[14px] font-semibold text-zinc-800 border-b border-zinc-50 pb-2">{t('product_info')}</h3>

            {/* Field 1 — Product Name English */}
            <div className="space-y-1.5 text-left">
              <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-0.5">
                {t('name_en')} <span className="text-rose-500">*</span>
              </Label>
              <input
                {...register("nameEn", { required: true })}
                placeholder="e.g. Iced Latte, Club Sandwich"
                className={`w-full h-[38px] px-3.5 border rounded-xl text-[13px] font-normal placeholder-zinc-400 bg-white transition-all outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10 ${
                  errors.nameEn ? "border-rose-500" : "border-zinc-200"
                }`}
              />
              {errors.nameEn && (
                <p className="text-[11px] text-rose-500 mt-1 font-medium">{t('name_required')}</p>
              )}
            </div>

            {/* Field 2 — Product Name Khmer */}
            <div className="space-y-1.5 text-left">
              <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-1">
                {t('name_km')} <span className="text-zinc-400 font-normal">{t('optional')}</span>
              </Label>
              <input
                {...register("nameKm")}
                placeholder="ឧ. ឡាតេទឹកកក"
                className="w-full h-[38px] px-3.5 border border-zinc-200 rounded-xl text-[13px] font-normal placeholder-zinc-400 bg-white transition-all outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10"
              />
            </div>

            {/* Row 3 — Price & Cost of Goods */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 text-left">
                <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-0.5">
                  {t('base_price')} <span className="text-rose-500">*</span>
                </Label>
                <PriceInput
                  valueCents={watch("basePriceCents")}
                  onChange={(cents) => setValue("basePriceCents", cents)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5 text-left">
                <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-1">
                  {t('cost_of_goods')} <span className="text-zinc-400 font-normal">{t('optional')}</span>
                </Label>
                <PriceInput
                  valueCents={watch("costCents") || 0}
                  onChange={(cents) => setValue("costCents", cents)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Row 4 — SKU & Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 text-left">
                <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-1">
                  {t('sku')} <span className="text-zinc-400 font-normal">{t('optional')}</span>
                </Label>
                <input
                  {...register("sku")}
                  placeholder="LAT-ICED"
                  className="w-full h-[38px] px-3.5 border border-zinc-200 rounded-xl text-[13px] font-normal placeholder-zinc-400 bg-white outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10"
                />
              </div>
              <div className="space-y-1.5 text-left">
                <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-1">
                  {t('unit')} <span className="text-zinc-400 font-normal">{t('optional')}</span>
                </Label>
                <input
                  {...register("unit")}
                  placeholder="cup, pc, portion"
                  className="w-full h-[38px] px-3.5 border border-zinc-200 rounded-xl text-[13px] font-normal placeholder-zinc-400 bg-white outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10"
                />
              </div>
            </div>
          </div>

          {/* Right Column — Product Photo upload / preview, description, availability */}
          <div className="space-y-5">
            <h3 className="text-[14px] font-semibold text-zinc-800 border-b border-zinc-50 pb-2">{t('media_details')}</h3>

            {/* Product Image preview / S3 file upload */}
            <div className="space-y-1.5 text-left">
              <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-1">
                {t('product_image')} <span className="text-zinc-400 font-normal">{t('optional')}</span>
              </Label>

              {imageUrl ? (
                <div className="relative w-full h-[200px] rounded-2xl overflow-hidden border border-zinc-200 group bg-zinc-50 shadow-inner">
                  <img
                    src={imageUrl}
                    alt="Product Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="h-8 px-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-medium text-xs shadow-md transition-transform active:scale-95 flex items-center gap-1"
                    >
                      <X size={14} /> {t('remove_photo')}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => !uploadingImage && fileInputRef.current?.click()}
                  className="w-full h-[200px] border-[1.5px] border-dashed border-zinc-200 hover:border-zinc-300 rounded-2xl flex flex-col items-center justify-center bg-zinc-50/30 hover:bg-zinc-50 transition-colors cursor-pointer group select-none shadow-inner"
                >
                  {uploadingImage ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 text-[var(--color-brand)] animate-spin" />
                      <span className="text-xs text-zinc-450 font-semibold">{t('uploading_photo')}</span>
                    </div>
                  ) : (
                    <>
                      <CloudUpload className="w-6 h-6 text-zinc-450 mb-1 group-hover:scale-105 transition-transform" />
                      <span className="text-[12px] text-zinc-650 font-semibold">{t('upload_photo')}</span>
                      <span className="text-[10px] text-zinc-400 mt-0.5">{t('upload_limit')}</span>
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

            {/* Description fields */}
            <div className="space-y-4">
              <div className="space-y-1.5 text-left">
                <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-2">
                  <span>{t('desc_en')}</span>
                  <span className="text-zinc-400 font-normal text-[11px] ml-auto">{t('optional')}</span>
                </Label>
                <textarea
                  {...register("descriptionEn")}
                  placeholder="Rich espresso blended with velvety steamed milk and a thin layer of microfoam..."
                  className="w-full h-[88px] min-h-[70px] p-3.5 border border-zinc-200 rounded-xl text-[12px] font-normal placeholder-zinc-400 bg-white outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10 resize-y transition-all"
                />
              </div>
              <div className="space-y-1.5 text-left">
                <Label className="text-[12px] font-semibold text-zinc-500 flex items-center gap-2">
                  <span>{t('desc_km')}</span>
                  <span className="text-zinc-400 font-normal text-[11px] ml-auto">{t('optional')}</span>
                </Label>
                <textarea
                  {...register("descriptionKm")}
                  placeholder="កាហ្វេ Espresso ដ៏ឈ្ងុយឆ្ងាញ់លាយជាមួយទឹកដោះគោ និងពពុះក្រាស់..."
                  className="w-full h-[88px] min-h-[70px] p-3.5 border border-zinc-200 rounded-xl text-[12px] font-normal placeholder-zinc-400 bg-white outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10 resize-y transition-all"
                />
              </div>
            </div>

            {/* Sort Order and Availability Switches */}
            <div className="grid grid-cols-2 gap-4 items-start pt-1">
              <div className="space-y-1.5 text-left">
                <Label className="text-[12px] font-semibold text-zinc-500">{t('sort_order')}</Label>
                <input
                  type="number"
                  min="1"
                  {...register("sortOrder", { valueAsNumber: true })}
                  className="w-[80px] h-[38px] px-3.5 border border-zinc-200 rounded-xl text-[13px] font-normal bg-white outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10"
                />
              </div>
              <div className="space-y-2 pt-1 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-zinc-650">{t('available')}</span>
                  <Switch
                    checked={watch("isAvailable")}
                    onCheckedChange={(v) => setValue("isAvailable", v)}
                    className="data-[state=checked]:bg-[var(--color-brand)] data-[state=unchecked]:bg-zinc-200 scale-90"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-zinc-650">{t('visible')}</span>
                  <Switch
                    checked={watch("isVisible")}
                    onCheckedChange={(v) => setValue("isVisible", v)}
                    className="data-[state=checked]:bg-[var(--color-brand)] data-[state=unchecked]:bg-zinc-200 scale-90"
                  />
                </div>
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
              isEdit ? t('save_changes') : t('create_product')
            )}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}
