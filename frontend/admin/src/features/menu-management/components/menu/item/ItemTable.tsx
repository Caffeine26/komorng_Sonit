"use client"

import { useState } from "react"
import { GripVertical, Pencil, Trash2, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusPill } from "../shared/StatusPill"
import { ConfirmModal } from "../shared/ConfirmModal"
import { useRouter, useParams } from "next/navigation"
import { useItems } from "../../../hooks/useItems"
import { MenuItem } from "../../../types"
import { useTranslations, useLocale } from "next-intl"
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog"

interface ItemTableProps {
  items: MenuItem[]
  categoryId: string
  categoryIcon?: string
  onEdit: (item: MenuItem) => void
  onRefetch: () => void
}

export function ItemTable({ items, categoryId, onEdit, onRefetch, categoryIcon }: ItemTableProps) {
  const router = useRouter()
  const params = useParams()
  const locale = useLocale()
  const tenantSlug = params?.tenantSlug as string || ""
  const t = useTranslations("item_table")

  const { deleteItem, updateItem, reorderItems } = useItems(categoryId)
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Visibility toggle confirmation states
  const [visibilityToggleTarget, setVisibilityToggleTarget] = useState<{ item: MenuItem; nextValue: boolean } | null>(null)
  const [togglingVisibility, setTogglingVisibility] = useState(false)

  // Drag and drop states
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [reorderConfirmTarget, setReorderConfirmTarget] = useState<{
    dragIndex: number
    dropIndex: number
  } | null>(null)

  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteItem(deleteTarget.id)
    } catch (error) {
      console.error(error)
    }
    setDeleting(false)
    setDeleteTarget(null)
    onRefetch()
  }

  async function handleConfirmVisibilityToggle() {
    if (!visibilityToggleTarget) return
    const { item, nextValue } = visibilityToggleTarget
    setTogglingVisibility(true)
    try {
      await updateItem(item.id, { isVisible: nextValue })
      onRefetch()
    } catch (error) {
      console.error(error)
    } finally {
      setTogglingVisibility(false)
      setVisibilityToggleTarget(null)
    }
  }

  async function handleToggleStatus(item: MenuItem, field: "isAvailable" | "isVisible", newValue: boolean) {
    try {
      await updateItem(item.id, { [field]: newValue } as any)
    } catch (error) {
      console.error(error)
    }
    onRefetch()
  }

  // Drag and drop helper functions
  function handleDragStart(e: React.DragEvent, index: number) {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = "move"
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    setDragOverIndex(index)
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    
    setReorderConfirmTarget({
      dragIndex: draggedIndex,
      dropIndex: index
    })

    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  function handleDragEnd() {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  async function handleConfirmReorder() {
    if (!reorderConfirmTarget) return
    const { dragIndex, dropIndex } = reorderConfirmTarget
    setReorderConfirmTarget(null)

    // Create a new array matching the new sorted order
    const updatedItems = [...items]
    const [draggedItem] = updatedItems.splice(dragIndex, 1)
    updatedItems.splice(dropIndex, 0, draggedItem)

    // Map each item in the new list to a sequential sortOrder starting from 1
    const reorderPayload = updatedItems.map((item, idx) => ({
      id: item.id,
      sortOrder: idx + 1
    }))

    try {
      await reorderItems(reorderPayload)
      onRefetch()
    } catch (err) {
      console.error(err)
      setErrorMsg("Failed to reorder items")
    }
  }

  return (
    <>
      <div className="rounded-[24px] border border-zinc-200/60 overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Table header */}
              <div className="grid grid-cols-[40px_88px_1fr_100px_120px_100px_180px] gap-4 bg-zinc-50/50 border-b border-zinc-100 px-6 py-4">
                <div />
                <span className="text-[12px] font-semibold text-zinc-500">{t('photo')}</span>
                <span className="text-[12px] font-semibold text-zinc-500 pl-16">{t('product_name')}</span>
                <span className="text-[12px] font-semibold text-zinc-500 text-right pr-6">{t('price')}</span>
                <span className="text-[12px] font-semibold text-zinc-500 text-center">{t('available')}</span>
                <span className="text-[12px] font-semibold text-zinc-500 text-center">{t('visible')}</span>
                <div className="text-[12px] font-semibold text-zinc-500 flex items-center justify-center">{t('actions')}</div>
              </div>

            {/* Table rows */}
            <div className="divide-y divide-zinc-100">
              {items.map((item, index) => {
                const itemImage = item.primaryImage?.imageUrl || 
                                  item.images?.find(img => img.isPrimary)?.imageUrl || 
                                  item.images?.[0]?.imageUrl || 
                                  categoryIcon;

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`grid grid-cols-[40px_88px_1fr_100px_120px_100px_180px] gap-4 items-center px-6 py-3 transition-all duration-200 ${
                      draggedIndex === index 
                        ? "opacity-35 bg-zinc-100 border-2 border-dashed border-zinc-300" 
                        : dragOverIndex === index 
                          ? "bg-primary/5 border-y-2 border-dashed border-primary" 
                          : "hover:bg-zinc-50/30"
                    }`}
                  >
                    {/* Drag handle */}
                    <div className="flex items-center justify-center cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-4 h-4 text-zinc-300 hover:text-zinc-500 transition-colors" />
                    </div>

                    {/* Photo thumbnail */}
                    <div className="w-20 h-20 rounded-xl bg-zinc-100 overflow-hidden border border-zinc-200 flex-shrink-0 flex items-center justify-center">
                      {itemImage ? (
                        <img src={itemImage} className="w-full h-full object-cover" alt={item.nameEn} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-50 text-zinc-400 text-[10px] font-normal">
                          {t('no_image')}
                        </div>
                      )}
                    </div>

                  {/* Name & SKU */}
                  <button
                    onClick={() => router.push(`/${tenantSlug}/menu/${categoryId}/${item.id}`)}
                    className="text-left focus:outline-none pl-16"
                  >
                    <p className="text-[14px] font-medium text-zinc-900 leading-snug">
                      {locale === "km" ? (item.nameKm || item.nameEn) : item.nameEn}
                    </p>
                    {item.sku && (
                      <span className="text-[11px] text-zinc-400 font-normal font-mono bg-zinc-100 px-1.5 py-0.5 rounded-md mt-0.5 inline-block">{item.sku}</span>
                    )}
                  </button>

                  {/* Price */}
                  <span className="text-[14px] text-zinc-900 font-normal text-right pr-6">
                    ${(item.basePriceCents / 100).toFixed(2)}
                  </span>

                  {/* Available status pill */}
                  <StatusPill
                    value={item.isAvailable}
                    labelTrue={t('in_stock')}
                    labelFalse={t('out_of_stock')}
                    onToggle={(v) => handleToggleStatus(item, "isAvailable", v)}
                  />

                  {/* Visible icon-switch */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => setVisibilityToggleTarget({ item, nextValue: !item.isVisible })}
                      className="p-2 rounded-xl hover:bg-zinc-50 text-zinc-450 text-zinc-400 hover:text-zinc-900 transition-colors"
                    >
                      {item.isVisible ? <Eye size={18} /> : <EyeOff size={18} className="text-zinc-300" />}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-center gap-1.5 w-full">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(item)}
                      className="h-8 px-2.5 text-[12px] font-medium text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 rounded-lg flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" /> {t('edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(item)}
                      className="h-8 px-2.5 text-[12px] font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {t('delete')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`${t('delete_title')} "${deleteTarget?.nameEn}"?`}
        description={t('delete_desc')}
        loading={deleting}
        onConfirm={handleDelete}
      />

      {/* Visibility toggle confirmation modal */}
      <ConfirmModal
        open={!!visibilityToggleTarget}
        onOpenChange={(open) => !open && setVisibilityToggleTarget(null)}
        title={visibilityToggleTarget?.nextValue ? t('make_visible') : t('hide_product')}
        description={
          visibilityToggleTarget
            ? visibilityToggleTarget.nextValue
              ? t('make_visible_desc')
              : t('hide_product_desc')
            : ""
        }
        loading={togglingVisibility}
        onConfirm={handleConfirmVisibilityToggle}
      />

      {/* Reorder confirmation modal */}
      <ConfirmModal
        open={!!reorderConfirmTarget}
        onOpenChange={(open) => !open && setReorderConfirmTarget(null)}
        title={t('reorder_title')}
        description={t('reorder_desc')}
        loading={false}
        onConfirm={handleConfirmReorder}
      />

      <GlobalActionDialog
        isOpen={!!errorMsg}
        title="Notice"
        description={errorMsg || ""}
        confirmLabel="OK"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
        variant="DESTRUCTIVE"
      />
    </>
  )
}
