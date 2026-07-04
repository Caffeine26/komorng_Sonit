"use client"

import { useState } from "react"
import { Plus, Search, FolderHeart, Ruler, SlidersHorizontal, Folder, X, ShoppingBag, LayoutGrid, List, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CategoryTable } from "@/features/menu-management/components/menu/category/CategoryTable"
import { CategoryFormModal } from "@/features/menu-management/components/menu/category/CategoryFormModal"
import { ItemTable } from "@/features/menu-management/components/menu/item/ItemTable"
import { ItemFormModal } from "@/features/menu-management/components/menu/item/ItemFormModal"
import { AdminProductCardVertical } from "@/features/menu-management/components/AdminProductCardVertical"
import { EmptyState } from "@/features/menu-management/components/menu/shared/EmptyState"
import { useCategories } from "@/features/menu-management/hooks/useCategories"
import { useItems } from "@/features/menu-management/hooks/useItems"
import { MenuCategory, MenuItem } from "@/features/menu-management/types"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"

export default function CategoryListPage() {
  const t = useTranslations("menu")
  const { categories, isLoading, refetch } = useCategories()
  const params = useParams()
  const locale = useLocale()
  const tenantSlug = params?.tenantSlug as string || ""

  const [searchQuery, setSearchQuery] = useState("")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MenuCategory | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [itemViewMode, setItemViewMode] = useState<"list" | "grid">("list")

  // Edit target for inline item form modal
  const [itemEditTarget, setItemEditTarget] = useState<MenuItem | null>(null)
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false)

  // Fetch items only when a category chip is selected
  const { items: categoryItems, isLoading: itemsLoading, refetch: refetchItems, deleteItem } = useItems(selectedCategoryId ?? undefined)

  function handleStartAdd() {
    setEditTarget(null)
    setDrawerOpen(true)
  }

  // Filter categories by name for the table
  const filteredCategories = categories.filter((cat) => {
    const q = searchQuery.toLowerCase()
    return (
      cat.nameEn.toLowerCase().includes(q) ||
      (cat.nameKm && cat.nameKm.toLowerCase().includes(q))
    )
  })

  const selectedCategory = categories.find(c => c.id === selectedCategoryId)

  return (
    <div className="flex flex-col min-h-full pb-24">

      {/* ── Sticky Header ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-zinc-200/50 px-6 sm:px-8 py-5 shadow-sm">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[24px] sm:text-[26px] font-semibold text-zinc-950 tracking-tight leading-tight pt-1">
              {t("title")}
            </h1>
            <p className="text-[12px] text-zinc-400 mt-1.5 font-medium">
              {t("desc")}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            <Button onClick={handleStartAdd} className="flex items-center gap-1.5 shadow-sm">
              <Plus size={16} /> {t("new_category")}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Main Content ───────────────────────────────────────────── */}
      <div className="max-w-[1600px] w-full mx-auto px-6 sm:px-8 mt-6 space-y-5">

        {/* ── Search + Category Chips Row ────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative shrink-0">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
              <Search size={15} />
            </span>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("search_categories")}
              className="pl-10 w-[210px] h-9 text-[13px]"
            />
          </div>

          {/* Category filter chips */}
          {!isLoading && categories.length > 0 && (
            <div className="flex items-center gap-8 overflow-x-auto pb-3 flex-1 min-w-0 px-2">
              {/* "All" chip */}
              <button
                onClick={() => setSelectedCategoryId(null)}
                className={`shrink-0 flex flex-col items-center justify-center gap-2 transition-all duration-300 ${selectedCategoryId === null
                  ? "text-[var(--color-brand)] scale-115 font-bold"
                  : "text-zinc-500 hover:text-zinc-950 hover:scale-105"
                  }`}
              >
                <div className="w-20 h-20 flex items-center justify-center shrink-0">
                  <LayoutGrid size={36} className={selectedCategoryId === null ? "text-[var(--color-brand)]" : "text-zinc-400"} />
                </div>
                <span className="text-[12px] font-semibold tracking-tight text-center leading-none mt-1">{t("all")}</span>
              </button>

              {categories.map(cat => {
                const isActive = selectedCategoryId === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(isActive ? null : cat.id)}
                    className={`shrink-0 flex flex-col items-center justify-center gap-2 transition-all duration-300 ${isActive
                      ? "text-[var(--color-brand)] scale-115 font-bold"
                      : "text-zinc-500 hover:text-zinc-950 hover:scale-105"
                      }`}
                  >
                    {/* Category thumbnail (just the naked image, no box border or bg wrapper) */}
                    <div className="w-20 h-20 flex items-center justify-center shrink-0">
                      {cat.urlBanner ? (
                        <img
                          src={cat.urlBanner}
                          alt={cat.nameEn}
                          className="w-full h-full object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.16)]"
                        />
                      ) : (
                        <Folder size={34} className={isActive ? "text-[var(--color-brand)]" : "text-zinc-400"} />
                      )}
                    </div>
                    <span className="text-[12px] font-semibold tracking-tight text-center truncate max-w-[90px] leading-none mt-1">
                      {locale === "km" ? (cat.nameKm || cat.nameEn) : cat.nameEn}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Inline product view when a category chip is active ── */}
        {selectedCategoryId ? (
          <div>
            {/* Section header — matches category page style */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-4.5">
                {/* Naked 3D Category Image (no border radius container box, same w-20 h-20 size as active display chip) */}
                <div className="w-20 h-20 flex items-center justify-center shrink-0">
                  {selectedCategory?.urlBanner ? (
                    <img
                      src={selectedCategory.urlBanner}
                      alt={selectedCategory.nameEn}
                      className="w-full h-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.14)] transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <Folder size={36} className="text-[var(--color-brand)]" />
                  )}
                </div>

                <div className="flex flex-col justify-center">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[20px] sm:text-[22px] font-bold text-zinc-900 leading-none">
                      {locale === "km" ? (selectedCategory?.nameKm || selectedCategory?.nameEn) : selectedCategory?.nameEn}
                    </h2>
                    {!itemsLoading && (
                      <span className="text-[12px] font-medium text-zinc-500 bg-zinc-100/70 px-3.5 py-1.5 rounded-2xl shrink-0 leading-none">
                        {categoryItems.length} {t("items")}
                      </span>
                    )}
                  </div>
                  {locale !== "km" && selectedCategory?.nameKm && (
                    <p className="text-[13px] sm:text-[14px] font-medium text-zinc-450 mt-1.5 leading-none">
                      {selectedCategory.nameKm}
                    </p>
                  )}
                </div>
              </div>

              {/* Controls — same as category page */}
              <div className="flex items-center gap-2 self-start sm:self-center">
                {/* List / Grid toggle */}
                <div className="flex items-center gap-1 border border-zinc-200/60 bg-white p-1 rounded-xl shadow-xs">
                  <button
                    onClick={() => setItemViewMode("list")}
                    className={`p-1.5 rounded-lg transition-all flex items-center gap-1 text-[12px] font-semibold ${itemViewMode === "list"
                      ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                      : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50"
                      }`}
                  >
                    <List size={14} /> {t("list")}
                  </button>
                  <button
                    onClick={() => setItemViewMode("grid")}
                    className={`p-1.5 rounded-lg transition-all flex items-center gap-1 text-[12px] font-semibold ${itemViewMode === "grid"
                      ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                      : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50"
                      }`}
                  >
                    <LayoutGrid size={14} /> {t("grid")}
                  </button>
                </div>

                {/* Add product button */}
                <Button
                  onClick={() => { setItemEditTarget(null); setItemDrawerOpen(true) }}
                  className="flex items-center gap-1.5 shadow-sm text-[13px] h-9 px-3"
                >
                  <Plus size={14} /> {t("new_product")}
                </Button>

                {/* Open full category page */}
                <Link
                  href={`/${tenantSlug}/menu/${selectedCategoryId}`}
                  className="inline-flex items-center gap-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 px-3 py-2 rounded-xl text-[12px] font-medium transition-all h-9"
                >
                  {t("open")} <ExternalLink size={12} />
                </Link>

                {/* Close chip */}
                <button
                  onClick={() => setSelectedCategoryId(null)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 border border-zinc-200 transition-colors h-9 w-9 flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Product display — reuse exact same components as category page */}
            {itemsLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                <span className="text-xs text-zinc-400 font-medium">{t("loading_products")}</span>
              </div>
            ) : categoryItems.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title={t("no_products")}
                description={t("no_products_desc")}
                actionLabel={t("add_product")}
                onAction={() => { setItemEditTarget(null); setItemDrawerOpen(true) }}
              />
            ) : itemViewMode === "list" ? (
              <ItemTable
                items={categoryItems}
                categoryId={selectedCategoryId}
                categoryIcon={selectedCategory?.urlBanner || selectedCategory?.icon}
                onEdit={setItemEditTarget}
                onRefetch={refetchItems}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {categoryItems.map((item) => (
                  <AdminProductCardVertical
                    key={item.id}
                    product={item}
                    categoryIcon={selectedCategory?.urlBanner || selectedCategory?.icon}
                    onEdit={() => setItemEditTarget(item)}
                    onDelete={async () => {
                      if (confirm(`Are you sure you want to delete "${item.nameEn}"?`)) {
                        try {
                          await deleteItem(item.id)
                          refetchItems()
                        } catch (e) {
                          console.error(e)
                        }
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Normal Category Table ─────────────────────────────── */
          <>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                <span className="text-xs text-zinc-400 font-medium">{t("fetching_categories")}</span>
              </div>
            ) : categories.length === 0 ? (
              <EmptyState
                icon={FolderHeart}
                title={t("no_categories")}
                description={t("no_categories_desc")}
                actionLabel={t("create_category")}
                onAction={handleStartAdd}
              />
            ) : (
              <CategoryTable
                categories={filteredCategories}
                onEdit={(cat) => { setEditTarget(cat); setDrawerOpen(true) }}
                onRefetch={refetch}
              />
            )}
          </>
        )}
      </div>

      {/* ── Category Form Modal ─────────────────────────────────── */}
      <CategoryFormModal
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editTarget={editTarget}
        onSuccess={() => {
          setDrawerOpen(false)
          refetch()
        }}
      />

      {/* ── Inline Item Form Modal (for filtered view) ───────────── */}
      {selectedCategoryId && (
        <ItemFormModal
          open={!!itemEditTarget || itemDrawerOpen}
          onOpenChange={(open) => {
            if (!open) {
              setItemDrawerOpen(false)
              setItemEditTarget(null)
            }
          }}
          categoryId={selectedCategoryId}
          editTarget={itemEditTarget}
          onSuccess={() => {
            setItemDrawerOpen(false)
            setItemEditTarget(null)
            refetchItems()
          }}
        />
      )}
    </div>
  )
}
