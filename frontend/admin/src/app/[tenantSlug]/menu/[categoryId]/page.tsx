"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { ArrowLeft, Plus, Search, ShoppingBag, LayoutGrid, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ItemTable } from "@/features/menu-management/components/menu/item/ItemTable"
import { ItemFormModal } from "@/features/menu-management/components/menu/item/ItemFormModal"
import { EmptyState } from "@/features/menu-management/components/menu/shared/EmptyState"
import { useItems } from "@/features/menu-management/hooks/useItems"
import { useCategories } from "@/features/menu-management/hooks/useCategories"
import { MenuItem } from "@/features/menu-management/types"
import { AdminProductCardVertical } from "@/features/menu-management/components/AdminProductCardVertical"

export default function ItemListPage() {
  const router = useRouter()
  const params = useParams()
  
  const locale = useLocale()
  const tenantSlug = params?.tenantSlug as string || ""
  const categoryId = params?.categoryId as string || ""

  const { items, isLoading, refetch, deleteItem } = useItems(categoryId)
  const { categories } = useCategories()

  const [searchQuery, setSearchQuery] = useState("")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MenuItem | null>(null)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")

  // Find the category object to show in breadcrumbs/header
  const currentCategory = categories.find((c) => c.id === categoryId)

  function handleStartAdd() {
    setEditTarget(null)
    setDrawerOpen(true)
  }

  // Filter items by English/Khmer name, SKU, or unit
  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase()
    return (
      item.nameEn.toLowerCase().includes(q) ||
      (item.nameKm && item.nameKm.toLowerCase().includes(q)) ||
      (item.sku && item.sku.toLowerCase().includes(q)) ||
      (item.unit && item.unit.toLowerCase().includes(q))
    )
  })

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] pb-24">
      {/* Premium header with breadcrumbs and back button */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-zinc-200/50 px-6 sm:px-8 py-5 shadow-sm">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/${tenantSlug}/menu`)}
              className="p-2.5 rounded-xl border border-zinc-200/60 bg-white text-zinc-650 hover:text-zinc-950 hover:bg-zinc-50 shadow-sm transition-all focus:outline-none"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-[20px] sm:text-[24px] font-semibold text-zinc-950 tracking-tight leading-none flex items-center gap-2">
                {currentCategory?.nameEn || "Products"}
                {currentCategory?.nameKm && (
                  <span className="text-zinc-400 font-normal text-sm sm:text-base">({currentCategory.nameKm})</span>
                )}
              </h1>
              <p className="text-[12px] text-zinc-400 mt-1.5 font-medium">
                Catalog / {currentCategory?.nameEn || "Category"} / Products
              </p>
            </div>
          </div>
          <Button onClick={handleStartAdd} className="flex items-center gap-1.5 self-start sm:self-center shadow-sm">
            <Plus size={16} /> New Product
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] w-full mx-auto px-6 sm:px-8 mt-8 space-y-6">
        
        {/* Search & Layout Toggle Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
              <Search size={16} />
            </span>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products in this category..."
              className="pl-11"
            />
          </div>

          {/* Toggle buttons between List and Grid */}
          <div className="flex items-center gap-1.5 border border-zinc-200/60 bg-white p-1 rounded-xl shadow-xs self-start sm:self-center">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
                viewMode === "list"
                  ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                  : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50"
              }`}
              title="List View"
            >
              <List size={15} />
              List
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
                viewMode === "grid"
                  ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                  : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50"
              }`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
              Grid
            </button>
          </div>
        </div>

        {/* Product List/Grid View */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-xs text-zinc-400 font-medium">Loading products...</span>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No Products Yet"
            description={`Start adding delicious menu items or products under the "${currentCategory?.nameEn || "selected"}" category.`}
            actionLabel="Add Product"
            onAction={handleStartAdd}
          />
        ) : viewMode === "list" ? (
          <ItemTable
            items={filteredItems}
            categoryId={categoryId}
            categoryIcon={currentCategory?.urlBanner || currentCategory?.icon}
            onEdit={setEditTarget}
            onRefetch={refetch}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredItems.map((item) => (
              <AdminProductCardVertical
                key={item.id}
                product={item}
                categoryIcon={currentCategory?.urlBanner || currentCategory?.icon}
                onEdit={() => setEditTarget(item)}
                onDelete={async () => {
                  if (confirm(`Are you sure you want to delete "${item.nameEn}"?`)) {
                    try {
                      await deleteItem(item.id)
                      refetch()
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

      {/* Product edit/create dialog modal */}
      <ItemFormModal
        open={!!editTarget || drawerOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDrawerOpen(false)
            setEditTarget(null)
          }
        }}
        categoryId={categoryId}
        editTarget={editTarget}
        onSuccess={() => {
          setDrawerOpen(false)
          setEditTarget(null)
          refetch()
        }}
      />
    </div>
  )
}
