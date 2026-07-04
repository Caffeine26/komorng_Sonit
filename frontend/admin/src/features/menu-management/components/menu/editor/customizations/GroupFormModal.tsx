"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { Loader2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useOptionGroups } from "../../../../hooks/useOptionGroups"
import { MenuItemOptionGroup, OptionGroupFormData } from "../../../../types"

interface GroupFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  menuItemId: string
  editTarget: MenuItemOptionGroup | null
  onSuccess: () => void
}

export function GroupFormModal({ open, onOpenChange, menuItemId, editTarget, onSuccess }: GroupFormModalProps) {
  const isEdit = !!editTarget
  const { createOptionGroup, updateOptionGroup } = useOptionGroups()
  
  const { register, handleSubmit, reset } = useForm<OptionGroupFormData>({
    defaultValues: { nameEn: "", nameKm: "", minSelect: 0, maxSelect: 0 }
  })
  const [submitting, setSubmitting] = useState(false)

  // Pre-fill form when editing
  useEffect(() => {
    if (open) {
      if (editTarget) {
        reset({
          nameEn: editTarget.nameEn,
          nameKm: editTarget.nameKm || "",
          minSelect: editTarget.minSelect,
          maxSelect: editTarget.maxSelect
        })
      } else {
        reset({
          nameEn: "",
          nameKm: "",
          minSelect: 0,
          maxSelect: 0
        })
      }
    }
  }, [editTarget, reset, open])

  async function onSubmit(data: OptionGroupFormData) {
    setSubmitting(true)
    try {
      if (isEdit && editTarget) {
        await updateOptionGroup(menuItemId, editTarget.id, data)
      } else {
        await createOptionGroup(menuItemId, data)
      }
      onSuccess()
    } catch (err) {
      console.error(err)
      alert("Failed to save customization group")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Customization Group" : "Add Customization Group"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-8 mt-2">
          {/* Name English */}
          <div className="space-y-1">
            <Label>Group Name (English) <span className="text-red-500">*</span></Label>
            <Input {...register("nameEn", { required: true })} placeholder="e.g. Choose Sweetness, Extra toppings" />
          </div>

          {/* Name Khmer */}
          <div className="space-y-1">
            <Label>Group Name (Khmer)</Label>
            <Input {...register("nameKm")} placeholder="កម្រិតភាពផ្អែម, ថែមគ្រឿងផ្សំ" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Min selection */}
            <div className="space-y-1">
              <Label>Min Selection</Label>
              <Input
                type="number"
                min="0"
                {...register("minSelect", { valueAsNumber: true })}
                placeholder="0"
              />
              <p className="text-[9px] text-zinc-400 leading-tight">Use 0 for optional, 1 for required.</p>
            </div>

            {/* Max selection */}
            <div className="space-y-1">
              <Label>Max Selection</Label>
              <Input
                type="number"
                min="0"
                {...register("maxSelect", { valueAsNumber: true })}
                placeholder="0"
              />
              <p className="text-[9px] text-zinc-400 leading-tight">Use 0 for unlimited choices.</p>
            </div>
          </div>
        </form>

        <DialogFooter className="gap-2 px-8">
          <Button onClick={() => onOpenChange(false)} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white">
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={submitting} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white">
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Saving...
              </>
            ) : (
              isEdit ? "Save Changes" : "Create Group"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
