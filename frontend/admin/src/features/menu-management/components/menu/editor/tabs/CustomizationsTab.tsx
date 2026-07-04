"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { GripVertical, X, Check, Loader2, Plus } from "lucide-react"
import { MenuItem, MenuItemOptionGroup } from "../../../../types"
import { cn } from "@/lib/utils/cn"
import { useOptionGroups } from "../../../../hooks/useOptionGroups"
import { useOptions } from "../../../../hooks/useOptions"
import { getAdminMenuItems, deleteAdminMenuItem } from "@/lib/api/menu";
import { ChoiceGroupTemplateFormModal } from "@/features/menu-management/components/ChoiceGroupTemplateFormModal"

import { GroupCard } from "../shared/GroupCard"
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog"

// ─── Props ────────────────────────────────────────────────────────────────────

interface CustomizationsTabProps {
  item: MenuItem
  attachedGroups: MenuItemOptionGroup[]
  setAttachedGroups: React.Dispatch<React.SetStateAction<MenuItemOptionGroup[]>>
  initialGroups: MenuItemOptionGroup[]
  onRefetch: () => void
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CustomizationsTab({
  item,
  attachedGroups,
  setAttachedGroups,
  initialGroups,
  onRefetch,
}: CustomizationsTabProps) {
  const params = useParams()
  const tenantSlug = (params?.tenantSlug as string) || ""

  const [isDragOver, setIsDragOver] = useState(false)
  const { createOptionGroup, updateOptionGroup, deleteOptionGroup } = useOptionGroups()
  const { createOption, updateOption, deleteOption } = useOptions()
  const [isSaving, setIsSaving] = useState(false)

  const [choiceTemplates, setChoiceTemplates] = useState<any[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true)
  const [isChoiceFormOpen, setIsChoiceFormOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null)
  const [actionDialog, setActionDialog] = useState<{ isOpen: boolean, title: string, variant: 'SUCCESS' | 'DESTRUCTIVE' }>({ isOpen: false, title: '', variant: 'SUCCESS' })

  const [draggedLibraryGroup, setDraggedLibraryGroup] = useState<any | null>(null)
  const [draggedAttachedIndex, setDraggedAttachedIndex] = useState<number | null>(null)

  // ── Load library ───────────────────────────────────────────────────────────

  const loadLibrary = useCallback(async () => {
    try {
      setIsLoadingLibrary(true)
      const data = await getAdminMenuItems("any", tenantSlug).catch(() => [])
      const choices: any[] = []
      if (data?.length) {
        data.forEach((product: any) => {
          if (product.descriptionEn === "GLOBAL_CHOICE_GROUP_TEMPLATE") {
            const firstGroup = product.optionGroups?.[0]
            if (firstGroup) {
              choices.push({
                id: product.id,
                nameEn: product.nameEn,
                nameKm: product.nameKm || "",
                minSelect: firstGroup.minSelect,
                maxSelect: firstGroup.maxSelect,
                options: [...(firstGroup.options || [])]
                  .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                  .map((o: any) => ({
                    id: o.id,
                    nameEn: o.nameEn,
                    nameKm: o.nameKm || "",
                    priceDeltaCents: o.priceDeltaCents || 0,
                    isAvailable: o.isAvailable !== false,
                    sortOrder: o.sortOrder ?? 0,
                    imageUrl: o.imageUrl || "",
                  })),
                rawProduct: product,
              })
            }
          }
        })
      }
      setChoiceTemplates(choices)
    } catch (err) {
      console.error("Failed to load choice templates library:", err)
    } finally {
      setIsLoadingLibrary(false)
    }
  }, [tenantSlug])

  useEffect(() => { loadLibrary() }, [loadLibrary])

  // ── Drag: library → right panel ───────────────────────────────────────────

  const handleDragStartLibrary = (group: any) => {
    setDraggedLibraryGroup(group)
    setDraggedAttachedIndex(null)
  }

  const handleDragOverZone = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedLibraryGroup) setIsDragOver(true)
  }

  const handleDragLeaveZone = (e: React.DragEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (
      e.clientX < r.left || e.clientX >= r.right ||
      e.clientY < r.top || e.clientY >= r.bottom
    ) setIsDragOver(false)
  }

  const handleDropZone = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (!draggedLibraryGroup) return
    if (attachedGroups.some((g) => g.id === draggedLibraryGroup.id)) return

    const newGroup: MenuItemOptionGroup = {
      id: draggedLibraryGroup.id,
      tenantId: item.tenantId,
      menuItemId: item.id,
      nameEn: draggedLibraryGroup.nameEn,
      nameKm: draggedLibraryGroup.nameKm,
      minSelect: draggedLibraryGroup.minSelect,
      maxSelect: draggedLibraryGroup.maxSelect,
      sortOrder: attachedGroups.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      options: draggedLibraryGroup.options.map((o: any) => ({
        id: o.id,
        tenantId: item.tenantId,
        menuItemId: item.id,
        optionGroupId: draggedLibraryGroup.id,
        nameEn: o.nameEn,
        nameKm: o.nameKm,
        priceDeltaCents: o.priceDeltaCents,
        isAvailable: o.isAvailable,
        sortOrder: o.sortOrder,
        imageUrl: o.imageUrl || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    }
    setAttachedGroups((prev) => [...prev, newGroup])
    setDraggedLibraryGroup(null)
  }

  // ── Drag: reorder within right panel ──────────────────────────────────────

  const handleDragStartAttached = (index: number) => {
    setDraggedAttachedIndex(index)
    setDraggedLibraryGroup(null)
  }

  const handleDragOverAttached = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedAttachedIndex === null || draggedAttachedIndex === index) return
    const reordered = [...attachedGroups]
    const [item2] = reordered.splice(draggedAttachedIndex, 1)
    reordered.splice(index, 0, item2)
    setDraggedAttachedIndex(index)
    setAttachedGroups(reordered)
  }

  const handleRemove = (id: string) =>
    setAttachedGroups((prev) => prev.filter((g) => g.id !== id))

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const toDelete = initialGroups.filter(
        (ig) => !attachedGroups.some((ag) => ag.id === ig.id)
      )
      for (const g of toDelete) await deleteOptionGroup(item.id, g.id)

      for (let i = 0; i < attachedGroups.length; i++) {
        const group = attachedGroups[i]
        const existing = initialGroups.find((ig) => ig.id === group.id)
        const groupPayload = {
          nameEn: group.nameEn,
          nameKm: group.nameKm || "",
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          sortOrder: i + 1,
        }

        let groupId = group.id

        if (existing) {
          await updateOptionGroup(item.id, group.id, groupPayload)
          const targetOpts = group.options ?? []
          const existingOpts = existing.options ?? []
          for (const eo of existingOpts.filter(
            (eo) => !targetOpts.some((to: any) => to.id === eo.id)
          )) await deleteOption(item.id, group.id, eo.id)

          for (let j = 0; j < targetOpts.length; j++) {
            const opt = targetOpts[j] as any
            const optPayload = {
              nameEn: opt.nameEn,
              nameKm: opt.nameKm || "",
              priceDeltaCents: opt.priceDeltaCents || 0,
              isAvailable: opt.isAvailable !== false,
              sortOrder: j + 1,
              imageUrl: opt.imageUrl || undefined,
            }
            if (existingOpts.some((eo) => eo.id === opt.id))
              await updateOption(item.id, group.id, opt.id, optPayload)
            else await createOption(item.id, group.id, optPayload)
          }
        } else {
          const newGroup = await createOptionGroup(item.id, groupPayload)
          groupId = newGroup.id
          for (let j = 0; j < (group.options ?? []).length; j++) {
            const opt = (group.options as any[])[j]
            await createOption(item.id, groupId, {
              nameEn: opt.nameEn,
              nameKm: opt.nameKm || "",
              priceDeltaCents: opt.priceDeltaCents || 0,
              isAvailable: opt.isAvailable !== false,
              sortOrder: j + 1,
              imageUrl: opt.imageUrl || undefined,
            })
          }
        }
      }
      onRefetch()
      setActionDialog({ isOpen: true, title: "Saved successfully!", variant: "SUCCESS" })
    } catch (err) {
      console.error(err)
      setActionDialog({ isOpen: true, title: "Failed to save. Please try again.", variant: "DESTRUCTIVE" })
    } finally {
      setIsSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-[550px] relative pb-20">

      <div className="grid grid-cols-[1fr_0.5px_1fr] items-stretch flex-1">

        {/* ── LEFT: Global library ── */}
        <div className="flex flex-col gap-3 pr-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[12px] font-semibold text-zinc-900">
                Global option group library
              </h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Drag any group to the right panel to attach it
              </p>
            </div>
            <button
              onClick={() => { setEditingTemplate(null); setIsChoiceFormOpen(true) }}
              className="flex items-center gap-1 text-[11px] font-semibold text-white bg-[var(--color-brand)] px-3 py-1.5 rounded-lg hover:bg-[#D4541A] transition-colors active:scale-95 shadow-sm"
            >
              <Plus className="w-3 h-3" /> Create group
            </button>
          </div>

          <div className="flex flex-col gap-2 pr-1">
            {isLoadingLibrary ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-400">
                <Loader2 className="animate-spin" size={18} />
                <span className="text-[11px]">Loading library…</span>
              </div>
            ) : choiceTemplates.length === 0 ? (
              <div className="border border-dashed border-zinc-200 rounded-xl p-8 text-center">
                <p className="text-[12px] font-medium text-zinc-400">No groups yet</p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Create one above to get started
                </p>
              </div>
            ) : (
              choiceTemplates.map((group) => {
                const isAttached = attachedGroups.some((g) => g.id === group.id)
                return (
                  <GroupCard
                    key={group.id}
                    group={group}
                    isAttached={isAttached}
                    showLibraryActions
                    draggable
                    onDragStart={() => handleDragStartLibrary(group)}
                    onDragEnd={() => setDraggedLibraryGroup(null)}
                    onEdit={() => {
                      setEditingTemplate(group.rawProduct)
                      setIsChoiceFormOpen(true)
                    }}
                    onDelete={async () => {
                      if (!confirm(`Delete template: ${group.nameEn}?`)) return
                      try {
                        await deleteAdminMenuItem("any", group.id, tenantSlug)
                        await loadLibrary()
                      } catch (err) {
                        console.error(err)
                        alert("Failed to delete template.")
                      }
                    }}
                  />
                )
              })
            )}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="bg-zinc-200/70 self-stretch" />

        {/* ── RIGHT: Attached to this product ── */}
        <div
          onDragOver={handleDragOverZone}
          onDragLeave={handleDragLeaveZone}
          onDrop={handleDropZone}
          className={cn(
            "flex flex-col gap-3 pl-5 rounded-2xl py-4 transition-colors min-h-[460px]",
            isDragOver ? "bg-orange-50/40" : "bg-zinc-50/50"
          )}
        >
          <div>
            <h3 className="text-[12px] font-semibold text-zinc-900">
              Attached to this product
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Drop option groups here · drag to reorder
            </p>
          </div>

          <div className="flex-1 flex flex-col gap-2">
            {attachedGroups.length === 0 ? (
              <div
                className={cn(
                  "flex-1 border-[1.5px] border-dashed rounded-xl flex flex-col items-center justify-center text-center p-10 transition-all min-h-[200px]",
                  isDragOver
                    ? "border-[var(--color-brand)] bg-[#FFF7ED]"
                    : "border-zinc-200"
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center mb-3 transition-colors",
                    isDragOver ? "bg-orange-100 text-[var(--color-brand)]" : "bg-zinc-100 text-zinc-400"
                  )}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12l7 7 7-7" />
                  </svg>
                </div>
                <p className={cn(
                  "text-[12px] font-medium transition-colors",
                  isDragOver ? "text-[var(--color-brand)]" : "text-zinc-500"
                )}>
                  Drag option groups from the left and drop here
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pr-1">
                {attachedGroups.map((group, idx) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    isAttached
                    draggable
                    onDragStart={() => handleDragStartAttached(idx)}
                    onDragOver={(e) => handleDragOverAttached(e, idx)}
                    onDragEnd={() => setDraggedAttachedIndex(null)}
                    onDetach={() => handleRemove(group.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Footer ── */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-zinc-200 py-3 px-4 flex items-center justify-end gap-3 z-40 rounded-b-2xl">
        <button
          onClick={() => setAttachedGroups(initialGroups)}
          disabled={isSaving}
          className="px-4 py-2 border border-zinc-200 rounded-lg text-zinc-600 text-[12px] font-medium hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          Discard
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2 bg-[var(--color-brand)] hover:bg-[#D4541A] disabled:opacity-50 text-white rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
        >
          {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isSaving ? "Saving…" : "Save attachments"}
        </button>
      </div>

      {/* ── Create/Edit modal ── */}
      <ChoiceGroupTemplateFormModal
        isOpen={isChoiceFormOpen}
        onClose={() => { setIsChoiceFormOpen(false); setEditingTemplate(null) }}
        initialData={editingTemplate}
        tenantSlug={tenantSlug}
        onSuccess={loadLibrary}
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