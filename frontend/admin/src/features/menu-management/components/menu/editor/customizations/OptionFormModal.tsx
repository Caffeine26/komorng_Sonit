import { useEffect, useState, useRef } from "react"
import { useForm } from "react-hook-form"
import { Loader2, Image as ImageIcon, Upload, X } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PriceInput } from "../../shared/PriceInput"
import { useOptions } from "../../../../hooks/useOptions"
import { useImages } from "../../../../hooks/useImages"
import { MenuItemOption, OptionFormData } from "../../../../types"

interface OptionFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  menuItemId: string
  groupId: string
  editTarget: MenuItemOption | null
  onSuccess: () => void
}

export function OptionFormModal({ open, onOpenChange, menuItemId, groupId, editTarget, onSuccess }: OptionFormModalProps) {
  const isEdit = !!editTarget
  const { createOption, updateOption } = useOptions()
  const { uploadImageFile } = useImages()

  const { register, handleSubmit, reset, setValue, watch } = useForm<OptionFormData>({
    defaultValues: { nameEn: "", nameKm: "", imageUrl: "", priceDeltaCents: 0, isAvailable: true }
  })
  
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const currentImageUrl = watch("imageUrl")

  // Pre-fill form when editing
  useEffect(() => {
    if (open) {
      if (editTarget) {
        reset({
          nameEn: editTarget.nameEn,
          nameKm: editTarget.nameKm || "",
          imageUrl: editTarget.imageUrl || "",
          priceDeltaCents: editTarget.priceDeltaCents,
          isAvailable: editTarget.isAvailable
        })
      } else {
        reset({
          nameEn: "",
          nameKm: "",
          imageUrl: "",
          priceDeltaCents: 0,
          isAvailable: true
        })
      }
    }
  }, [editTarget, reset, open])

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      // Upload using the existing catalog image upload API
      const url = await uploadImageFile(file)
      setValue("imageUrl", url)
    } catch (err) {
      console.error("Failed to upload image:", err)
      alert("Failed to upload image. Please try again.")
    } finally {
      setUploading(false)
      // Reset input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function handleRemoveImage() {
    setValue("imageUrl", "")
  }

  async function onSubmit(data: OptionFormData) {
    setSubmitting(true)
    try {
      if (isEdit && editTarget) {
        await updateOption(menuItemId, groupId, editTarget.id, data)
      } else {
        await createOption(menuItemId, groupId, data)
      }
      onSuccess()
    } catch (err) {
      console.error(err)
      alert("Failed to save choice option")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Choice Item" : "Add Choice Item"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-8 mt-2 max-h-[70vh] overflow-y-auto no-scrollbar pb-2">
          
          {/* Option Image Upload */}
          <div className="space-y-2 mb-4">
            <Label>Option Image <span className="text-zinc-400 font-normal text-[11px]">(optional)</span></Label>
            
            {currentImageUrl ? (
              <div className="relative w-24 h-24 rounded-xl border overflow-hidden group">
                <img src={currentImageUrl} alt="Option" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-rose-500 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => !uploading && fileInputRef.current?.click()}
                disabled={uploading}
                className="w-24 h-24 rounded-xl border border-dashed border-zinc-300 flex flex-col items-center justify-center text-zinc-400 hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-orange-50/50 transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin mb-1" />
                ) : (
                  <ImageIcon size={20} strokeWidth={1.5} className="mb-1" />
                )}
                <span className="text-[10px] font-medium leading-none">
                  {uploading ? "Uploading..." : "Add photo"}
                </span>
              </button>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleImageSelect}
            />
          </div>

          {/* Name English */}
          <div className="space-y-1">
            <Label>Choice Name (English) <span className="text-red-500">*</span></Label>
            <Input {...register("nameEn", { required: true })} placeholder="e.g. Extra Pearl, Less Sugar" />
          </div>

          {/* Name Khmer */}
          <div className="space-y-1">
            <Label>Choice Name (Khmer)</Label>
            <Input {...register("nameKm")} placeholder="បន្ថែមគុជ, ស្ករតិច" />
          </div>

          {/* Price Delta Cents */}
          <div className="space-y-1">
            <Label>Price Delta / Extra Fee (USD) <span className="text-red-500">*</span></Label>
            <PriceInput
              valueCents={watch("priceDeltaCents")}
              onChange={(cents) => setValue("priceDeltaCents", cents)}
              placeholder="0.00"
              allowNegative={true}           // Delta can be positive or negative
            />
            <p className="text-[9px] text-zinc-400 leading-tight">Use 0.00 if this choice is free, positive values to add cost, negative to subtract cost.</p>
          </div>

          {/* Active status */}
          <div className="flex items-center justify-between border border-zinc-200/50 rounded-2xl p-4 bg-zinc-50/20 shadow-sm mt-3">
            <div>
              <Label className="text-zinc-900 font-medium">In Stock / Available</Label>
              <p className="text-[10px] text-zinc-400 mt-1 font-normal">If active, customers can select this choice</p>
            </div>
            <Switch
              checked={watch("isAvailable")}
              onCheckedChange={(v) => setValue("isAvailable", v)}
            />
          </div>
        </form>

        <DialogFooter className="gap-2 px-8 pb-4">
          <Button onClick={() => onOpenChange(false)} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white">
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={submitting || uploading} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white">
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Saving...
              </>
            ) : (
              isEdit ? "Save Changes" : "Add Choice"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
