"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PriceInput } from "../../shared/PriceInput"
import { MenuItem, ItemFormData } from "../../../../types"

interface BasicInfoTabProps {
  item: MenuItem
  saving: boolean
  onSave: (data: Partial<ItemFormData>) => void
}

export function BasicInfoTab({ item, saving, onSave }: BasicInfoTabProps) {
  const { register, handleSubmit, reset, setValue, watch } = useForm<ItemFormData>({
    defaultValues: {
      nameEn: item.nameEn,
      nameKm: item.nameKm || "",
      descriptionEn: item.descriptionEn || "",
      descriptionKm: item.descriptionKm || "",
      basePriceCents: item.basePriceCents,
      costCents: item.costCents || 0,
      unit: item.unit || "",
      sku: item.sku || "",
      isAvailable: item.isAvailable,
      isVisible: item.isVisible,
    }
  })

  // Keep form in sync if item changes elsewhere
  useEffect(() => {
    reset({
      nameEn: item.nameEn,
      nameKm: item.nameKm || "",
      descriptionEn: item.descriptionEn || "",
      descriptionKm: item.descriptionKm || "",
      basePriceCents: item.basePriceCents,
      costCents: item.costCents || 0,
      unit: item.unit || "",
      sku: item.sku || "",
      isAvailable: item.isAvailable,
      isVisible: item.isVisible,
    })
  }, [item, reset])

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div>
        <h2 className="text-[18px] font-normal text-zinc-950 tracking-tight leading-none mb-1">Basic Information</h2>
        <p className="text-[12px] text-zinc-400 font-medium">Update the primary details, descriptions, and storefront visibility status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-zinc-100">
        
        {/* Name English */}
        <div className="space-y-2">
          <Label>Product name (English) <span className="text-red-500">*</span></Label>
          <Input {...register("nameEn", { required: true })} placeholder="e.g. Cappuccino" />
        </div>

        {/* Name Khmer */}
        <div className="space-y-2">
          <Label>Product name (Khmer)</Label>
          <Input {...register("nameKm")} placeholder="កាពូឈីណូ" />
        </div>

        {/* Base Price Cents */}
        <div className="space-y-2">
          <Label>Base price (USD) <span className="text-red-500">*</span></Label>
          <PriceInput
            valueCents={watch("basePriceCents")}
            onChange={(cents) => setValue("basePriceCents", cents)}
            placeholder="0.00"
          />
        </div>

        {/* Cost Cents */}
        <div className="space-y-2">
          <Label>Cost of goods <span className="text-zinc-400 font-normal text-xs">(optional)</span></Label>
          <PriceInput
            valueCents={watch("costCents") || 0}
            onChange={(cents) => setValue("costCents", cents)}
            placeholder="0.00"
          />
        </div>

        {/* Description English */}
        <div className="space-y-2 md:col-span-2">
          <Label>Description (English)</Label>
          <textarea
            {...register("descriptionEn")}
            placeholder="Espresso topped with thick layer of frothy milk..."
            className="flex w-full min-h-[90px] rounded-2xl border border-zinc-200/60 bg-white px-5 py-3 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:border-primary/20 transition-all shadow-sm resize-none"
          />
        </div>

        {/* Description Khmer */}
        <div className="space-y-2 md:col-span-2">
          <Label>Description (Khmer)</Label>
          <textarea
            {...register("descriptionKm")}
            placeholder="កាហ្វេ​ Espresso លាយជាមួយទឹកដោះគោដែលមានពពុះក្រាស់..."
            className="flex w-full min-h-[90px] rounded-2xl border border-zinc-200/60 bg-white px-5 py-3 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:border-primary/20 transition-all shadow-sm resize-none"
          />
        </div>

        {/* SKU & Unit */}
        <div className="space-y-2">
          <Label>SKU</Label>
          <Input {...register("sku")} placeholder="CAP-HOT" />
        </div>
        
        <div className="space-y-2">
          <Label>Selling unit</Label>
          <Input {...register("unit")} placeholder="cup, piece, set" />
        </div>

        {/* Switch toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2 mt-2">
          <div className="flex items-center justify-between border border-zinc-200/50 rounded-2xl p-4 bg-zinc-50/20 shadow-sm">
            <div>
              <Label className="text-zinc-900 font-medium">In stock / Available</Label>
              <p className="text-[11px] text-zinc-400 mt-1 font-normal">If active, customers can order this item</p>
            </div>
            <Switch
              checked={watch("isAvailable")}
              onCheckedChange={(v) => setValue("isAvailable", v)}
            />
          </div>

          <div className="flex items-center justify-between border border-zinc-200/50 rounded-2xl p-4 bg-zinc-50/20 shadow-sm">
            <div>
              <Label className="text-zinc-950 font-medium">Storefront visibility</Label>
              <p className="text-[11px] text-zinc-400 mt-1 font-normal">If inactive, hidden from catalog displays</p>
            </div>
            <Switch
              checked={watch("isVisible")}
              onCheckedChange={(v) => setValue("isVisible", v)}
            />
          </div>
        </div>

      </div>

      <div className="flex justify-end pt-4 border-t border-zinc-150">
        <Button type="submit" disabled={saving} className="min-w-36">
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              Saving...
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  )
}
