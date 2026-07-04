"use client"
import { useLocale } from "next-intl";

import { useState, useEffect, useRef } from "react"
import { Loader2, Plus, Minus, Search, Folder, LayoutGrid, X, ChevronDown, Check } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getAdminTables, type TableItem } from "@/lib/api/table";
import { submitAdminOrder } from "@/lib/api/order";
import {
  useAdminSession,
  useAdminCart,
  type AdminCartItem,
  OrderProductCard,
  ProductCustomizationModal,
  type CustomizationResult,
} from "@/features/order-management"
import { cn } from "@/lib/utils/cn"
import { useTranslations } from "next-intl"
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog"

// Re-using the catalog hooks for the exact same fetching logic
import { useCategories } from "@/features/menu-management/hooks/useCategories"
import { useItems } from "@/features/menu-management/hooks/useItems"
import { MenuItem } from "@/features/menu-management/types"


export default function NewOrderPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params?.tenantSlug as string || ""
  const locale = useLocale()
  const t = useTranslations("new_order")

  // Data fetching
  const [tables, setTables] = useState<TableItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [selectedTableId, setSelectedTableId] = useState<string>("")
  const { categories, isLoading: categoriesLoading } = useCategories()

  const [searchQuery, setSearchQuery] = useState("")
  const [tableSearchQuery, setTableSearchQuery] = useState("")
  const [isTableDropdownOpen, setIsTableDropdownOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const tableDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tableDropdownRef.current && !tableDropdownRef.current.contains(event.target as Node)) {
        setIsTableDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Fetch items based on category selection
  const { items, isLoading: itemsLoading, getItem } = useItems(selectedCategoryId ?? "all")

  const {
    cart,
    totalCents,
    itemCount,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  } = useAdminCart()

  const {
    sessionId,
    isReady: sessionReady,
    isError: sessionError,
    refresh: refreshSession,
  } = useAdminSession(tenantSlug)

  // Customization Modal State
  const [modalItem, setModalItem] = useState<MenuItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFetchingItemDetail, setIsFetchingItemDetail] = useState(false)
  
  // Dialog State
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Fetch tables
    getAdminTables(tenantSlug).then(res => setTables(res || [])).catch(console.error)
  }, [tenantSlug])

  // Click on a product card
  const handleProductClick = async (product: MenuItem) => {
    // Always show the detail/customization modal for every item
    setIsFetchingItemDetail(true)
    try {
      const fullItem = await getItem(product.id)
      setModalItem(fullItem)
      setIsModalOpen(true)
    } catch (err) {
      console.error("Failed to load item detail", err)
    } finally {
      setIsFetchingItemDetail(false)
    }
  }


  const updateCartQuantity = (cartItemId: string, delta: number) => {
    updateQuantity(cartItemId, delta)
  }

  const removeCartItem = (cartItemId: string) => {
    removeItem(cartItemId)
  }

  async function onSubmit() {
    if (cart.length === 0) return
    if (sessionId === null && !sessionError) {
      setErrorMsg(t('wait_setup'))
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        sessionId: sessionId ?? undefined,
        tableId: selectedTableId || undefined,
        items: cart.map(item => ({
          menuItemId: item.menuItemId,
          itemName: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          variantSnapshot: item.variantId
            ? { variantId: item.variantId, variantName: item.variantName ?? null }
            : null,
          optionsSnapshot: item.addons.length > 0
            ? item.addons.map(a => ({
              groupId: a.groupId,
              optionId: a.optionId,
              name: a.name,
              priceDeltaCents: a.priceDeltaCents,
            }))
            : null,
          notes: item.notes ?? undefined,
        })),
        locale: locale as 'en' | 'km',
      }
      console.log('[NewOrder] Submitting payload:', JSON.stringify(payload, null, 2))
      await submitAdminOrder(payload, tenantSlug)
      clearCart()
      router.push(`/${tenantSlug}/orders`)
    } catch (err) {
      console.error('[NewOrder] Submit error:', err)
      setErrorMsg(t('submit_failed'))
    } finally {
      setSubmitting(false)
    }
  }


  // Filter items if searching
  const displayItems = items.filter(item => {
    const q = searchQuery.toLowerCase()
    return (
      item.nameEn.toLowerCase().includes(q) ||
      (item.nameKm && item.nameKm.toLowerCase().includes(q))
    )
  })

  const selectedCategory = categories.find(c => c.id === selectedCategoryId)

  return (
    <div className="flex flex-col h-full bg-zinc-50/10 animate-ui-entry">

      {/* ── TOP BAR ── */}
      <header className="py-3 sm:py-4 px-4 md:px-8 lg:px-10 flex flex-col lg:flex-row lg:items-center gap-4 justify-between flex-shrink-0 relative z-40 bg-white/40 backdrop-blur-md border-b border-zinc-100">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 flex-1 w-full">
          <div className="relative flex-1 w-full max-w-[280px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-950/60" />
            <input
              type="text"
              placeholder={t('search_products')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-11 sm:h-12 pl-12 pr-6 bg-white/60 border border-zinc-100 rounded-xl text-[13px] sm:text-[14px] font-normal text-zinc-950 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/10 transition-all placeholder:text-zinc-950/40"
            />
          </div>

          {/* Category filter chips */}
          {!categoriesLoading && categories.length > 0 && (
            <div className="flex items-center gap-8 overflow-x-auto pb-3 flex-1 min-w-0 px-2 h-auto">
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
                <span className="text-[12px] font-semibold tracking-tight text-center leading-none mt-1">{t('all')}</span>
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
                    {/* Category thumbnail */}
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
      </header>

      {/* ── MAIN CONTENT ── */}
      <div className="flex flex-col lg:flex-row w-full gap-6 mt-6">

        {/* Left Column - Product Grid */}
        <div className="flex-1 bg-zinc-50/50 p-4 md:p-8 space-y-6 rounded-3xl border border-zinc-100">

            {/* Category Header */}
            {selectedCategory && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 animate-ui-entry">
                <div className="flex items-center gap-4.5">
                  <div className="w-20 h-20 flex items-center justify-center shrink-0">
                    {selectedCategory.urlBanner ? (
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
                        {locale === "km" ? (selectedCategory.nameKm || selectedCategory.nameEn) : selectedCategory.nameEn}
                      </h2>
                      {!itemsLoading && (
                        <span className="text-[12px] font-medium text-zinc-500 bg-zinc-100/70 px-3.5 py-1.5 rounded-2xl shrink-0 leading-none">
                          {displayItems.length} {t('items')}
                        </span>
                      )}
                    </div>
                    {locale !== "km" && selectedCategory.nameKm && (
                      <p className="text-[13px] sm:text-[14px] font-medium text-zinc-450 mt-1.5 leading-none">
                        {selectedCategory.nameKm}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Grid */}
            {itemsLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-primary w-8 h-8" />
              </div>
            ) : displayItems.length === 0 ? (
              <div className="flex justify-center items-center h-40 text-zinc-400 text-sm">{t('no_items')}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 pb-8">
                {displayItems.map(item => (
                  <OrderProductCard
                    key={item.id}
                    product={item}
                    onClick={() => handleProductClick(item)}
                  />
                ))}
              </div>
            )}
        </div>

        {/* Right Column - Cart */}
        <div className="w-full lg:w-[400px] bg-white border border-zinc-150 rounded-3xl shrink-0 shadow-[0_10px_30px_rgba(0,0,0,0.02)] z-10 overflow-hidden">
          {/* Table Selection */}
          <div className="p-6 border-b border-zinc-100 space-y-3">
            <h3 className="text-[16px] font-semibold text-zinc-900">{t('order_details')}</h3>
            <div className="flex flex-col gap-3" ref={tableDropdownRef}>
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-medium text-zinc-500">{t('table_assignment')}</label>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 z-10" />
                <Input
                  type="text"
                  placeholder={t('select_table')}
                  value={tableSearchQuery}
                  onChange={(e) => {
                    setTableSearchQuery(e.target.value)
                    setIsTableDropdownOpen(true)
                  }}
                  onFocus={() => {
                    if (!tableSearchQuery) {
                      const selected = tables.find(t => t.id === selectedTableId)
                      if (selected) setTableSearchQuery(selected.name)
                    }
                    setIsTableDropdownOpen(true)
                  }}
                  className="w-full h-11 pl-9 pr-10 bg-zinc-50 border-zinc-200 rounded-xl focus:bg-white text-[14px] cursor-text"
                />
                <button
                  onClick={() => setIsTableDropdownOpen(!isTableDropdownOpen)}
                  className="absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center text-zinc-400 hover:text-zinc-600"
                >
                  <ChevronDown size={16} />
                </button>

                {isTableDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto py-1">
                    <div
                      className={cn(
                        "px-4 py-2.5 cursor-pointer text-[14px] flex items-center justify-between transition-colors",
                        selectedTableId === "" ? "bg-primary/5 text-primary font-semibold" : "text-zinc-700 font-medium hover:bg-zinc-50"
                      )}
                      onClick={() => {
                        setSelectedTableId("")
                        setTableSearchQuery("")
                        setIsTableDropdownOpen(false)
                      }}
                    >
                      {t('takeaway_no_table')}
                      {selectedTableId === "" && <Check size={14} />}
                    </div>
                    {tables
                      .filter(t => t.name.toLowerCase().includes(tableSearchQuery.toLowerCase()))
                      .map(table => {
                        const isSelected = selectedTableId === table.id
                        return (
                          <div
                            key={table.id}
                            className={cn(
                              "px-4 py-2.5 cursor-pointer text-[14px] flex items-center justify-between transition-colors",
                              isSelected ? "bg-primary/5 text-primary font-semibold" : "text-zinc-900 hover:bg-zinc-50"
                            )}
                            onClick={() => {
                              setSelectedTableId(table.id)
                              setTableSearchQuery(table.name)
                              setIsTableDropdownOpen(false)
                            }}
                          >
                            <span>
                              {table.name} {table.status !== 'available' ? <span className="text-zinc-400 font-normal">({table.status})</span> : ''}
                            </span>
                            {isSelected && <Check size={14} />}
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cart Items */}
          <div className="p-6 space-y-4 bg-zinc-50/30">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-zinc-800">{t('current_order')}</h3>
              <span className="text-[12px] font-medium text-primary bg-primary/10 px-2 py-1 rounded-md">
                {cart.reduce((s, i) => s + i.quantity, 0)} {t('items')}
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <div className="w-16 h-16 rounded-full bg-zinc-100 border-2 border-dashed border-zinc-200 flex items-center justify-center text-zinc-400">
                  <LayoutGrid size={24} />
                </div>
                <p className="text-[14px] text-zinc-400 max-w-[200px]">{t('empty_cart')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.id} className="flex flex-col p-4 bg-white border border-zinc-100 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] gap-3 relative group">
                    <button
                      onClick={() => removeCartItem(item.id)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >
                      <X size={12} strokeWidth={3} />
                    </button>

                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-0.5 pr-4">
                        <span className="text-[14px] font-semibold text-zinc-900 leading-tight">{item.name}</span>
                        {item.variantName && (
                          <span className="text-[12px] font-semibold text-primary leading-tight">
                            ▸ {item.variantName}
                          </span>
                        )}
                        {item.addons.map((addon, idx) => (
                          <span key={idx} className="text-[12px] text-zinc-500 leading-tight">
                            + {addon.name}
                          </span>
                        ))}
                        {item.notes && (
                          <span className="text-[12px] text-amber-600 font-medium italic">
                            {t('note')}: {item.notes}
                          </span>
                        )}

                      </div>
                      <span className="text-[14px] font-bold text-zinc-900 shrink-0">
                        ${((item.unitPriceCents * item.quantity) / 100).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[13px] font-medium text-zinc-400">${(item.unitPriceCents / 100).toFixed(2)} / {t('ea')}</span>
                      <div className="flex items-center gap-3 bg-zinc-50 rounded-full p-1 border border-zinc-100">
                        <button onClick={() => updateCartQuantity(item.id, -1)} className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-zinc-600 hover:text-rose-500 shadow-sm transition-colors">
                          <Minus size={14} />
                        </button>
                        <span className="text-[14px] font-bold w-5 text-center">{item.quantity}</span>
                        <button onClick={() => updateCartQuantity(item.id, 1)} className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white shadow-sm hover:bg-primary/90 transition-colors">
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals & Submit */}
          <div className="p-6 bg-white border-t border-zinc-100 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-6">
              <span className="text-[15px] font-medium text-zinc-500">{t('total_amount')}</span>
              <span className="text-2xl font-bold text-zinc-900 tracking-tight">${(totalCents / 100).toFixed(2)}</span>
            </div>
            <Button
              onClick={onSubmit}
              disabled={cart.length === 0 || submitting || !sessionReady}
              className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-medium rounded-2xl disabled:opacity-50 text-[15px] transition-all active:scale-[0.98]"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t('place_order')}
            </Button>
          </div>
        </div>
      </div>

      <ProductCustomizationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={modalItem}
        onAddToCart={(result: CustomizationResult) => {
          if (!modalItem) return
          const name = locale === 'km' && modalItem.nameKm ? modalItem.nameKm : modalItem.nameEn
          addItem({
            menuItemId: result.menuItemId,
            name,
            quantity: result.quantity,
            unitPriceCents: result.finalPriceCents,
            variantId: result.variantId,
            variantName: result.variantName,
            addons: result.addons,
            notes: result.notes,
          })
        }}
      />

      {/* Loading Overlay for fetching item details */}
      {isFetchingItemDetail && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-white/50 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      <GlobalActionDialog
        isOpen={!!errorMsg}
        title="Notice"
        description={errorMsg || ""}
        confirmLabel="OK"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />
    </div>
  )
}
