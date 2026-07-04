"use client"

import { useEffect, useState } from "react"
import { Loader2, X, Plus, Minus, Search } from "lucide-react"
import { useParams } from "next/navigation"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getAdminMenuOverview } from "@/lib/api/overview";
import { getAdminTables, type TableItem } from "@/lib/api/table";
import { type AdminMenuOverviewResponse } from "@xfos/contracts-bff-admin"
import { cn } from "@/lib/utils/cn"
import { submitAdminOrder } from "@/lib/api/order";
import { useAdminSession, useAdminCart, type AdminCartItem } from "@/features/order-management"
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog";

interface OrderFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}



export function OrderFormModal({ open, onOpenChange, onSuccess }: OrderFormModalProps) {
  const params = useParams()
  const tenantSlug = params?.tenantSlug as string || ""

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [menu, setMenu] = useState<AdminMenuOverviewResponse | null>(null)
  const [tables, setTables] = useState<TableItem[]>([])

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTableId, setSelectedTableId] = useState<string>("")
  const { cart, totalCents, itemCount, addItem, updateQuantity, removeItem, clearCart } = useAdminCart()
  const { sessionId, isReady: sessionReady } = useAdminSession(tenantSlug)
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      clearCart()
      setSelectedTableId("")
      setSearchQuery("")
      fetchData()
    }
  }, [open, tenantSlug])

  async function fetchData() {
    setLoading(true)
    try {
      const [menuRes, tablesRes] = await Promise.all([
        getAdminMenuOverview(tenantSlug),
        getAdminTables(tenantSlug)
      ])
      setMenu(menuRes)
      setTables(tablesRes || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }



  const updateCartQuantity = (menuItemId: string, delta: number) => {
    updateQuantity(menuItemId, delta)
  }

  // totalCents provided by useAdminCart hook

  async function onSubmit() {
    if (cart.length === 0) return
    if (!sessionReady || !sessionId) {
      setErrorMsg('Please wait, setting up session...')
      return
    }
    setSubmitting(true)
    try {
      await submitAdminOrder({
        sessionId,
        tableId: selectedTableId || undefined,
        items: cart.map(item => ({
          menuItemId: item.menuItemId,
          itemName: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
        })),
      }, tenantSlug)
      onSuccess()
    } catch (err) {
      console.error(err)
      setErrorMsg('Failed to submit order')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredCategories = menu?.categories.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      item.name.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.name.km && item.name.km.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  })).filter(cat => cat.items.length > 0) || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1000px] w-full p-0 overflow-hidden border border-zinc-200 rounded-[20px] bg-white shadow-[0_40px_100px_rgba(0,0,0,0.12)]">

        {/* Header */}
        <DialogHeader className="relative px-8 pt-7 pb-5 border-b border-zinc-100 flex flex-row items-start justify-between bg-zinc-50/50">
          <div className="text-left">
            <DialogTitle className="text-[20px] font-semibold text-zinc-900 leading-none">
              New Manual Order
            </DialogTitle>
            <p className="text-[13px] text-zinc-500 mt-2 font-normal leading-tight">
              Punch in an order manually for a walk-in or a customer paying with cash.
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-150 transition-colors"
          >
            <X size={16} />
          </button>
        </DialogHeader>

        {/* Content Body */}
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] h-[65vh] overflow-hidden">

          {/* Left Column - Menu Items */}
          <div className="flex flex-col border-r border-zinc-100 bg-white">
            <div className="p-4 border-b border-zinc-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 rounded-xl border-zinc-200"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-6">
              {loading ? (
                <div className="flex justify-center items-center h-40">
                  <Loader2 className="animate-spin text-primary w-6 h-6" />
                </div>
              ) : filteredCategories.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 text-sm">No items found</div>
              ) : (
                filteredCategories.map(cat => (
                  <div key={cat.id} className="space-y-3">
                    <h3 className="font-semibold text-[14px] text-zinc-800 sticky top-0 bg-white py-2 z-10">
                      {cat.name.en}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {cat.items.map(item => (
                        <div
                          key={item.id}
                          onClick={() => addItem({
                            menuItemId: item.id,
                            name: item.name.en,
                            quantity: 1,
                            unitPriceCents: item.priceCents,
                            addons: [],
                          })}
                          className={cn(
                            "flex flex-col gap-2 p-3 rounded-xl border border-zinc-100 cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm active:scale-[0.98]",
                            !item.available && "opacity-50 pointer-events-none grayscale"
                          )}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[13px] font-medium text-zinc-900 leading-tight">{item.name.en}</span>
                            <span className="text-[13px] font-semibold text-primary shrink-0">${(item.priceCents / 100).toFixed(2)}</span>
                          </div>
                          {!item.available && <span className="text-[10px] text-rose-500 font-medium">Out of stock</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column - Cart & Checkout Details */}
          <div className="flex flex-col bg-zinc-50/30">
            {/* Table Selection */}
            <div className="p-6 border-b border-zinc-100 space-y-3">
              <h3 className="text-[14px] font-semibold text-zinc-800">Order Details</h3>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-zinc-500">Table (Optional)</label>
                <select
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  className="w-full h-10 px-3 border border-zinc-200 rounded-xl text-[13px] bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                >
                  <option value="">Takeaway (No Table)</option>
                  {tables.map(table => (
                    <option key={table.id} value={table.id}>
                      {table.name} {table.status !== 'available' ? `(${table.status})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <h3 className="text-[14px] font-semibold text-zinc-800">Cart ({itemCount} items)</h3>

              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                    <Plus size={20} />
                  </div>
                  <p className="text-[13px] text-zinc-400">Click items on the left to add them to the cart.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-white border border-zinc-100 rounded-xl shadow-sm">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-medium text-zinc-900">{item.name}</span>
                        <span className="text-[12px] font-medium text-zinc-500">${(item.unitPriceCents / 100).toFixed(2)} each</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => updateCartQuantity(item.id, -1)} className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 hover:bg-zinc-200">
                          <Minus size={14} />
                        </button>
                        <span className="text-[13px] font-semibold w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateCartQuantity(item.id, 1)} className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20">
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals & Submit */}
            <div className="p-6 border-t border-zinc-100 bg-white mt-auto">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[14px] font-medium text-zinc-500">Total Amount</span>
                <span className="text-[20px] font-semibold text-zinc-900">${(totalCents / 100).toFixed(2)}</span>
              </div>
              <Button
                onClick={onSubmit}
                disabled={cart.length === 0 || submitting || !sessionReady}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl shadow-md disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit Order"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
      
      <GlobalActionDialog
        isOpen={!!errorMsg}
        title="Notice"
        description={errorMsg || ""}
        confirmLabel="OK"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />
    </Dialog>
  )
}
