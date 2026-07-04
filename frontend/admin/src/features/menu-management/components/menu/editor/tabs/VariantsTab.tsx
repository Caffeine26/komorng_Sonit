"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { GripVertical, Star, X, Check, ArrowRight, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { useVariants } from "../../../../hooks/useVariants"
import { getAdminMenuItems, deleteAdminMenuItem } from "@/lib/api/menu";
import { SizeTemplateFormModal } from "@/features/menu-management/components/SizeTemplateFormModal"
import { GroupCard } from "../shared/GroupCard"
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog"

interface VariantsTabProps {
  item: any
  attachedVariants: any[]
  setAttachedVariants: React.Dispatch<React.SetStateAction<any[]>>
  initialVariants: any[]
  onRefetch: () => void
}

export function VariantsTab({
  item,
  attachedVariants,
  setAttachedVariants,
  initialVariants,
  onRefetch
}: VariantsTabProps) {
  const params = useParams()
  const tenantSlug = (params?.tenantSlug as string) || ""

  const [isDragOver, setIsDragOver] = useState(false)
  const { createVariant, updateVariant, deleteVariant } = useVariants()
  const [isSaving, setIsSaving] = useState(false)

  // Modal state for creating/editing templates
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null)
  const [actionDialog, setActionDialog] = useState<{isOpen: boolean, title: string, variant: 'SUCCESS' | 'DESTRUCTIVE'}>({ isOpen: false, title: '', variant: 'SUCCESS' })

  // Drag states
  const [draggedLibraryTemplate, setDraggedLibraryTemplate] = useState<any | null>(null)
  const [draggedAttachedIndex, setDraggedAttachedIndex] = useState<number | null>(null)

  // Global library state
  const [globalTemplates, setGlobalTemplates] = useState<any[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true)

  const loadLibrary = useCallback(async () => {
    try {
      setIsLoadingLibrary(true)
      const data = await getAdminMenuItems("any", tenantSlug).catch(() => [])
      const sizes: any[] = []

      if (data && data.length > 0) {
        data.forEach((product: any) => {
          if (product.descriptionEn === "GLOBAL_VARIANT_TEMPLATE") {
            sizes.push({
              id: product.id,
              nameEn: product.nameEn,
              nameKm: product.nameKm,
              variants: (product.variants || []).map((v: any) => ({
                id: v.id,
                nameEn: v.nameEn,
                nameKm: v.nameKm || "",
                price: v.priceCents / 100,
                cost: v.costCents ? v.costCents / 100 : "",
                sku: v.sku || "",
                isAvailable: v.isAvailable !== false,
                isDefault: !!v.isDefault,
                sortOrder: v.sortOrder ?? 0
              })).sort((a: any, b: any) => a.sortOrder - b.sortOrder)
            })
          }
        })
      }

      setGlobalTemplates(sizes)
    } catch (error) {
      console.warn("Failed to load global templates from backend:", error)
      setGlobalTemplates([])
    } finally {
      setIsLoadingLibrary(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    if (tenantSlug) {
      loadLibrary()
    }
  }, [tenantSlug, loadLibrary])

  // Group flat variants by attributeNameEn/Km dynamically for real-time split rendering
  const normalizedAttached = React.useMemo(() => {
    if (!attachedVariants || attachedVariants.length === 0) return []
    if (attachedVariants[0]?.variants) return attachedVariants

    const groups: { [key: string]: any } = {}

    attachedVariants.forEach(v => {
      const attrNameEn = v.attributeNameEn || "Sizes"
      const attrNameKm = v.attributeNameKm || attrNameEn

      if (!groups[attrNameEn]) {
        groups[attrNameEn] = {
          id: `group-${attrNameEn.toLowerCase().replace(/\s+/g, '-')}`,
          nameEn: attrNameEn,
          nameKm: attrNameKm,
          isDefault: false,
          defaultVariantId: "",
          variants: []
        }
      }

      if (v.isDefault) {
        groups[attrNameEn].isDefault = true
        groups[attrNameEn].defaultVariantId = v.id
      }

      groups[attrNameEn].variants.push({
        id: v.id,
        nameEn: v.nameEn,
        nameKm: v.nameKm || "",
        price: v.price !== undefined ? v.price : ((v.priceCents || 0) / 100),
        cost: v.cost !== undefined ? v.cost : (v.costCents ? (v.costCents / 100) : ""),
        sku: v.sku || "",
        isAvailable: v.isAvailable !== false,
        isDefault: !!v.isDefault
      })
    })

    const result = Object.values(groups)
    if (result.length > 0) {
      const hasDefault = result.some(t => t.isDefault)
      if (!hasDefault) {
        result[0].isDefault = true
      }
      result.forEach(t => {
        if (!t.defaultVariantId && t.variants.length > 0) {
          const defaultVar = t.variants.find((v: any) => v.isDefault) || t.variants[0]
          t.defaultVariantId = defaultVar.id
        }
      })
    }
    return result
  }, [attachedVariants])

  // Drag & drop handlers
  const handleDragStartLibrary = (template: any) => {
    setDraggedLibraryTemplate(template)
    setDraggedAttachedIndex(null)
  }

  const handleDragStartAttached = (index: number) => {
    setDraggedAttachedIndex(index)
    setDraggedLibraryTemplate(null)
  }

  const handleDragOverZone = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedLibraryTemplate) {
      setIsDragOver(true)
    }
  }

  const handleDragLeaveZone = (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragOver(false)
    }
  }

  const handleDropZone = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    if (draggedLibraryTemplate) {
      const isAlreadyAttached = normalizedAttached.some(t => t.nameEn === draggedLibraryTemplate.nameEn)
      if (isAlreadyAttached) return

      const newAttached = {
        ...draggedLibraryTemplate,
        id: `dropped-${draggedLibraryTemplate.id}-${Date.now()}`,
        isDefault: normalizedAttached.length === 0,
        defaultVariantId: draggedLibraryTemplate.variants[0]?.id || "",
        variants: draggedLibraryTemplate.variants.map((v: any) => ({
          ...v,
          id: `new-${v.id}-${Date.now()}`
        }))
      }

      const updated = [...normalizedAttached, newAttached]
      setAttachedVariants(updated)
      setDraggedLibraryTemplate(null)
    }
  }

  const handleDragOverAttachedCard = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedAttachedIndex !== null && draggedAttachedIndex !== index) {
      const reordered = [...normalizedAttached]
      const [draggedCard] = reordered.splice(draggedAttachedIndex, 1)
      reordered.splice(index, 0, draggedCard)
      setDraggedAttachedIndex(index)
      setAttachedVariants(reordered)
    }
  }

  const handleSetDefaultTemplate = (id: string) => {
    const updated = normalizedAttached.map(t => ({
      ...t,
      isDefault: t.id === id
    }))
    setAttachedVariants(updated)
  }

  const handleSetDefaultVariant = (templateId: string, variantId: string) => {
    const updated = normalizedAttached.map(t => {
      if (t.id === templateId) {
        return {
          ...t,
          defaultVariantId: variantId,
          variants: t.variants.map((v: any) => ({
            ...v,
            isDefault: v.id === variantId
          }))
        }
      }
      return t
    })
    setAttachedVariants(updated)
  }

  const handleRemove = (id: string) => {
    const filtered = normalizedAttached.filter(t => t.id !== id)
    if (filtered.length > 0 && !filtered.some(t => t.isDefault)) {
      filtered[0].isDefault = true
    }
    setAttachedVariants(filtered)
  }

  const handleUpdateVariantField = (templateId: string, variantId: string, field: string, value: any) => {
    const updated = normalizedAttached.map(t => {
      if (t.id === templateId) {
        return {
          ...t,
          variants: t.variants.map((v: any) => {
            if (v.id === variantId) {
              return { ...v, [field]: value }
            }
            return v
          })
        }
      }
      return t
    })
    setAttachedVariants(updated)
  }

  const handleDiscard = () => {
    setAttachedVariants(initialVariants)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Map local grouped templates back down to flat API formats
      const targetVariants = normalizedAttached.flatMap((template) =>
        template.variants.map((v: any, idx: number) => ({
          id: v.id,
          nameEn: v.nameEn || "Size Option",
          nameKm: v.nameKm || "",
          attributeNameEn: template.nameEn,
          attributeNameKm: template.nameKm || template.nameEn,
          priceCents: Math.round((parseFloat(v.price) || 0) * 100),
          costCents: v.cost !== undefined && v.cost !== null && v.cost !== "" ? Math.round(parseFloat(v.cost) * 100) : null,
          sku: v.sku || null,
          isAvailable: v.isAvailable !== false,
          isDefault: template.isDefault && template.defaultVariantId === v.id,
          sortOrder: idx + 1
        }))
      )

      // 1. Delete initial variants that are no longer present
      const toDelete = initialVariants.filter(
        (initial) => !targetVariants.some((tv) => tv.id === initial.id)
      )
      for (const v of toDelete) {
        await deleteVariant(item.id, v.id)
      }

      // 2. Create or Update remaining variants
      for (const target of targetVariants) {
        const exists = initialVariants.find((iv) => iv.id === target.id)
        const payload = {
          nameEn: target.nameEn,
          nameKm: target.nameKm,
          attributeNameEn: target.attributeNameEn,
          attributeNameKm: target.attributeNameKm,
          priceCents: target.priceCents,
          costCents: target.costCents,
          sku: target.sku,
          isAvailable: target.isAvailable,
          isDefault: target.isDefault,
          sortOrder: target.sortOrder
        }

        if (exists) {
          await updateVariant(item.id, target.id, payload)
        } else {
          await createVariant(item.id, payload)
        }
      }

      // Re-fetch item to sync state
      onRefetch()
      setActionDialog({ isOpen: true, title: "Size variants successfully saved!", variant: "SUCCESS" })
    } catch (err) {
      console.error(err)
      setActionDialog({ isOpen: true, title: "Failed to save size variants. Please try again.", variant: "DESTRUCTIVE" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-[550px] relative pb-20">

      {/* Double column split layout container */}
      <div className="grid grid-cols-[1fr_0.5px_1fr] gap-6 items-stretch flex-1">

        {/* LEFT COLUMN: Global variant library */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[12px] font-semibold text-zinc-900">Global variant library</h3>
              <p className="text-[11px] text-zinc-500 mt-1 font-medium">Drag any size template to the right panel to attach it</p>
            </div>
            <button
              onClick={() => {
                setEditingTemplate(null)
                setIsCreateModalOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 text-zinc-700 hover:text-zinc-950 rounded-xl text-[11px] font-semibold transition-all shadow-sm focus:outline-none shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--color-brand)] stroke-[2.5]" /> New Template
            </button>
          </div>

          <div className="space-y-2.5 pr-1">
            {isLoadingLibrary && globalTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--color-brand)]" />
                <span className="text-[11px] font-medium">Loading size library...</span>
              </div>
            ) : globalTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-zinc-200/80 rounded-2xl text-zinc-400 text-center bg-zinc-50/20">
                <span className="text-[12px] font-semibold text-zinc-700">No size templates found</span>
                <span className="text-[10px] text-zinc-400 mt-1 max-w-[200px] leading-relaxed">Click "+ New Template" above to create and manage size options in your database.</span>
              </div>
            ) : (
              globalTemplates.map(template => {
                const isAttached = normalizedAttached.some(t => t.nameEn === template.nameEn)

                // Map the size template structure to match choice option group layout expected by GroupCard
                const mappedGroup = {
                  id: template.id,
                  nameEn: template.nameEn,
                  nameKm: template.nameKm,
                  minSelect: 1,
                  maxSelect: 1,
                  options: template.variants.map((v: any) => ({
                    id: v.id,
                    nameEn: v.nameEn,
                    nameKm: v.nameKm,
                    priceDeltaCents: Math.round((v.price ?? 0) * 100),
                    isAvailable: v.isAvailable !== false
                  }))
                }

                return (
                  <GroupCard
                    key={template.id}
                    group={mappedGroup}
                    isAttached={isAttached}
                    draggable={true}
                    onDragStart={() => handleDragStartLibrary(template)}
                    showLibraryActions={true}
                    onEdit={() => {
                      setEditingTemplate(template)
                      setIsCreateModalOpen(true)
                    }}
                    onDelete={async () => {
                      if (confirm(`Are you sure you want to delete this template: ${template.nameEn}?`)) {
                        try {
                          await deleteAdminMenuItem("any", template.id, tenantSlug)
                          await loadLibrary()
                        } catch (err) {
                          console.error(err)
                          alert("Failed to delete template.")
                        }
                      }
                    }}
                  />
                )
              })
            )}
          </div>
        </div>

        {/* Visual Divider Line */}
        <div className="bg-zinc-200/80 w-[0.5px] self-stretch" />

        {/* RIGHT COLUMN: Attached to this product */}
        <div
          onDragOver={handleDragOverZone}
          onDragLeave={handleDragLeaveZone}
          onDrop={handleDropZone}
          className={cn(
            "flex flex-col gap-4 rounded-3xl p-5 transition-all min-h-[460px]",
            isDragOver ? "bg-orange-50/30" : "bg-zinc-50/50"
          )}
        >
          <div>
            <h3 className="text-[12px] font-semibold text-zinc-900">Attached to this product</h3>
            <p className="text-[11px] text-zinc-500 mt-1 font-medium">Drop templates here · drag rows to reorder</p>
          </div>

          <div className="flex-1 flex flex-col gap-2">
            {normalizedAttached.length === 0 ? (
              <div
                className={cn(
                  "flex-1 border-[1.5px] border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-8 transition-colors",
                  isDragOver
                    ? "border-[var(--color-brand)] bg-[#FFF7ED]"
                    : "border-zinc-200/80"
                )}
              >
                <div className="text-zinc-400 mb-3">
                  <Plus className="w-8 h-8 mx-auto stroke-[1.5]" />
                </div>
                <p className={cn(
                  "text-[12px] font-medium transition-colors",
                  isDragOver ? "text-[var(--color-brand)]" : "text-zinc-500"
                )}>
                  Drag templates from the left panel and drop here
                </p>
              </div>
            ) : (
              <div className="space-y-3 pr-1">
                {normalizedAttached.map((template, idx) => {
                  const mappedGroup = {
                    id: template.id,
                    nameEn: template.nameEn,
                    nameKm: template.nameKm,
                    minSelect: 1,
                    maxSelect: 1,
                    options: template.variants.map((v: any) => ({
                      id: v.id,
                      nameEn: v.nameEn,
                      nameKm: v.nameKm,
                      priceDeltaCents: Math.round((v.price ?? 0) * 100),
                      isAvailable: v.isAvailable !== false,
                      isDefault: template.defaultVariantId === v.id || v.isDefault
                    }))
                  }

                  return (
                    <GroupCard
                      key={template.id}
                      group={mappedGroup}
                      isAttached={true}
                      draggable={true}
                      onDragStart={() => handleDragStartAttached(idx)}
                      onDragOver={(e) => handleDragOverAttachedCard(e, idx)}
                      onDragEnd={() => setDraggedAttachedIndex(null)}
                      onDetach={() => handleRemove(template.id)}
                      onEdit={() => {
                        setEditingTemplate(template)
                        setIsCreateModalOpen(true)
                      }}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Sticky Bottom Actions Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-zinc-150/80 px-6 py-4 flex items-center justify-between gap-4 z-10">
        <button
          onClick={handleDiscard}
          className="px-5 py-2.5 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 font-bold rounded-2xl text-[13px] transition-all focus:outline-none"
        >
          Discard
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-[var(--color-brand)] hover:bg-[#d65516] disabled:opacity-50 text-white font-bold rounded-2xl text-[13px] shadow-lg shadow-orange-500/10 transition-all focus:outline-none"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" /> Save attachments
            </>
          )}
        </button>
      </div>

      {/* Create / Edit Size Template Form Modal */}
      <SizeTemplateFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        tenantSlug={tenantSlug}
        initialData={editingTemplate}
        onSuccess={async () => {
          setIsCreateModalOpen(false)
          setEditingTemplate(null)
          await loadLibrary()
        }}
      />
      
      <GlobalActionDialog
        isOpen={actionDialog.isOpen}
        onClose={() => setActionDialog({ ...actionDialog, isOpen: false })}
        onConfirm={() => setActionDialog({ ...actionDialog, isOpen: false })}
        title={actionDialog.title}
        variant={actionDialog.variant}
        confirmLabel="OK"
        cancelLabel=""
      />

    </div>
  )
}
