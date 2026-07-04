"use client"

import { useState } from "react"
import { GripVertical, Pencil, Trash2, ChevronRight, Folder, List, Grid, FolderOpen, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusPill } from "../shared/StatusPill"
import { ConfirmModal } from "../shared/ConfirmModal"
import { useRouter, useParams } from "next/navigation"
import { useCategories } from "../../../hooks/useCategories"
import { useTranslations, useLocale } from "next-intl"

interface CategoryTableProps {
  categories: MenuCategory[]
  onEdit: (category: MenuCategory) => void
  onRefetch: () => void
}

export function CategoryTable({ categories, onEdit, onRefetch }: CategoryTableProps) {
  const router = useRouter()
  const params = useParams()
  const locale = useLocale()
  const tenantSlug = params?.tenantSlug as string || ""
  const t = useTranslations("category_table")

  const { deleteCategory, updateCategory, reorderCategories } = useCategories()
  const [deleteTarget, setDeleteTarget] = useState<MenuCategory | null>(null)
  const [deleting, setDeleting] = useState(false)

  // View mode switcher: list vs grid
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid")

  // Category Drag and drop states
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [reorderConfirmTarget, setReorderConfirmTarget] = useState<{
    dragIndex: number
    dropIndex: number
  } | null>(null)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCategory(deleteTarget.id)
    } catch (error) {
      console.error(error)
    }
    setDeleting(false)
    setDeleteTarget(null)
    onRefetch()
  }

  async function handleToggleStatus(category: MenuCategory, newValue: boolean) {
    try {
      await updateCategory(category.id, { isActive: newValue })
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
    const updatedCategories = [...categories]
    const [draggedCat] = updatedCategories.splice(dragIndex, 1)
    updatedCategories.splice(dropIndex, 0, draggedCat)

    // Map each category in the new list to a sequential sortOrder starting from 1
    const reorderPayload = updatedCategories.map((cat, idx) => ({
      id: cat.id,
      sortOrder: idx + 1
    }))

    try {
      await reorderCategories(reorderPayload)
      onRefetch()
    } catch (err) {
      console.error(err)
      alert("Failed to reorder categories")
    }
  }

  return (
    <>
      {/* Table Toolbar & View Switcher */}
      <div className="flex items-center justify-between bg-white px-6 py-4 rounded-[20px] border border-zinc-200/50 shadow-sm">
        <div className="text-[13px] font-medium text-zinc-500">
          {t('showing')} <span className="font-semibold text-zinc-950">{categories.length}</span> {t('categories')}
        </div>
        <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200/40">
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === "list"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            <List size={14} /> <span className="hidden sm:inline">{t('list_view')}</span>
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === "grid"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            <Grid size={14} /> <span className="hidden sm:inline">{t('grid_view')}</span>
          </button>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="rounded-[24px] border border-zinc-200/60 overflow-hidden bg-white shadow-sm mt-4">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Table header */}
              <div className="grid grid-cols-[24px_80px_100px_1fr_100px_120px_180px] gap-4 bg-zinc-50/50 border-b border-zinc-100 px-6 py-4">
                <div />
                <span className="text-[12px] font-semibold text-zinc-500 text-center">{t('sort_num')}</span>
                <span className="text-[12px] font-semibold text-zinc-500 pl-2">{t('image')}</span>
                <span className="text-[12px] font-semibold text-zinc-500 pl-6">{t('category_name')}</span>
                <span className="text-[12px] font-semibold text-zinc-500 text-center">{t('items')}</span>
                <span className="text-[12px] font-semibold text-zinc-500 text-center">{t('status')}</span>
                <div className="text-[12px] font-semibold text-zinc-500 flex items-center justify-center">{t('actions')}</div>
              </div>

              {/* Table rows */}
              <div className="divide-y divide-zinc-100">
                {categories.map((cat, index) => (
                  <div
                    key={cat.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`grid grid-cols-[24px_80px_100px_1fr_100px_120px_180px] gap-4 items-center px-6 py-3 transition-all duration-200 ${
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

                    {/* Sort order */}
                    <div className="text-center">
                      <span className="text-[12px] font-normal text-zinc-400">{cat.sortOrder ?? index + 1}</span>
                    </div>

                    {/* Image */}
                    <div className="w-20 h-20 rounded-xl bg-zinc-50 border border-zinc-200 overflow-hidden flex items-center justify-center text-zinc-400 flex-shrink-0">
                      {cat.urlBanner ? (
                        <img src={cat.urlBanner} className="w-full h-full object-cover" alt={cat.nameEn} />
                      ) : (
                        <Folder size={20} />
                      )}
                    </div>

                    {/* Category name */}
                    <button
                      onClick={() => router.push(`/${tenantSlug}/menu/${cat.id}`)}
                      className="text-left focus:outline-none pl-6"
                    >
                      <p className="text-[14px] font-medium text-zinc-900 leading-snug truncate">
                        {locale === "km" ? (cat.nameKm || cat.nameEn) : cat.nameEn}
                      </p>
                    </button>

                    {/* Items counter */}
                    <div className="text-center">
                      <span className="text-[13px] font-medium text-zinc-600">
                        {cat._count?.items ?? 0}
                      </span>
                    </div>

                    {/* Status pill */}
                    <StatusPill
                      value={cat.isActive}
                      labelTrue={t('active')}
                      labelFalse={t('inactive')}
                      onToggle={(v) => handleToggleStatus(cat, v)}
                    />

                    {/* Actions */}
                    <div className="flex items-center justify-center gap-1.5 w-full">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(cat)}
                        className="h-8 px-2 text-[12px] font-medium text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex items-center gap-0.5"
                      >
                        <Pencil className="w-3.5 h-3.5" /> {t('edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(cat)}
                        className="h-8 px-2 text-[12px] font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {t('delete')}
                      </Button>
                      <button
                        onClick={() => router.push(`/${tenantSlug}/menu/${cat.id}`)}
                        className="p-1.5 rounded-lg text-zinc-300 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Modern Premium Category Grid Card Layout */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-4">
          {categories.map((cat, index) => (
            <div
              key={cat.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => router.push(`/${tenantSlug}/menu/${cat.id}`)}
              className={`h-[320px] cursor-pointer rounded-[28px] border border-zinc-150 relative group overflow-hidden transition-all duration-300 bg-zinc-50 ${
                draggedIndex === index
                  ? "opacity-35 scale-95 border-2 border-dashed border-zinc-300 shadow-none"
                  : dragOverIndex === index
                    ? "border-2 border-dashed border-primary bg-primary/5 shadow-md scale-[1.02]"
                    : "shadow-sm hover:shadow-lg hover:border-zinc-200"
              }`}
            >
              {/* Drag Handle (Floats on hover) */}
              <div className="absolute top-3 left-3 z-30 opacity-0 group-hover:opacity-100 transition-opacity bg-white/70 backdrop-blur-md p-1.5 rounded-xl border border-white/60 shadow-sm cursor-grab active:cursor-grabbing">
                <GripVertical className="w-4 h-4 text-zinc-400" />
              </div>

              {/* Banner Backdrop Image (Fills the card background) */}
              <div className="absolute inset-0 w-full h-full overflow-hidden bg-gradient-to-tr from-indigo-50/50 to-rose-50/50">
                {cat.urlBanner ? (
                  <img 
                    src={cat.urlBanner} 
                    className="w-full h-full object-cover" 
                    alt={cat.nameEn}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100/50">
                    <Folder className="w-12 h-12 text-zinc-300" />
                  </div>
                )}
              </div>

              {/* Floating Glassmorphic Content Card */}
              <div className="absolute bottom-3 left-3 right-3 p-4 bg-white/45 backdrop-blur-md border border-white/40 rounded-[22px] shadow-[0_8px_30px_rgb(0,0,0,0.06)] flex flex-col justify-between min-h-[110px] z-10">
                {/* Row 1: Name & Products count */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-zinc-950 text-[14px] leading-snug truncate">
                      {locale === "km" ? (cat.nameKm || cat.nameEn) : cat.nameEn}
                    </h3>
                    {locale !== "km" && cat.nameKm && (
                      <p className="text-zinc-500 text-[11px] font-medium truncate mt-0.5">
                        {cat.nameKm}
                      </p>
                    )}
                  </div>
                  <div className="text-[10px] font-semibold text-zinc-600 bg-zinc-950/5 border border-zinc-950/5 px-2 py-0.5 rounded-lg flex-shrink-0 backdrop-blur-sm">
                    {cat._count?.items ?? 0} {t('products')}
                  </div>
                </div>

                {/* Row 2: Status & Actions */}
                <div className="flex items-center justify-between pt-2.5 border-t border-zinc-950/5 mt-2 gap-2">
                  <div onClick={(e) => e.stopPropagation()}>
                    <StatusPill
                      value={cat.isActive}
                      labelTrue={t('active')}
                      labelFalse={t('inactive')}
                      onToggle={(v) => handleToggleStatus(cat, v)}
                    />
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(cat); }}
                      className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                      title="Edit Category"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(cat); }}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                      title="Delete Category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`${t('delete_title')} "${deleteTarget?.nameEn}"?`}
        description={t('delete_desc')}
        loading={deleting}
        onConfirm={handleDelete}
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
    </>
  )
}
