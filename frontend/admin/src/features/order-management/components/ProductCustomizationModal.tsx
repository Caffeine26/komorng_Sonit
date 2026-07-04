"use client"
import { useLocale } from "next-intl";

import React, { useState, useEffect } from "react"
import { X, Plus, Minus } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { MenuItem, MenuItemVariant, MenuItemOptionGroup, MenuItemOption } from "../../menu-management/types"
import { cn } from "@/lib/utils/cn"

export interface CartItemAddon {
  groupId: string
  optionId: string
  name: string
  priceDeltaCents: number
}

export interface CustomizationResult {
  menuItemId: string
  variantId?: string
  variantName?: string
  quantity: number
  addons: CartItemAddon[]
  finalPriceCents: number
  notes?: string
}

interface ProductCustomizationModalProps {
  isOpen: boolean
  onClose: () => void
  product: MenuItem | null
  onAddToCart: (result: CustomizationResult) => void
}

export const ProductCustomizationModal = ({
  isOpen,
  onClose,
  product,
  onAddToCart
}: ProductCustomizationModalProps) => {
  const params = useParams()
  const locale = useLocale()

  const [quantity, setQuantity] = useState(1)
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>()
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({})
  const [notes, setNotes] = useState("")

  // Reset state when a new product is opened
  useEffect(() => {
    if (product) {
      setQuantity(1)
      const defaultVariant = product.variants?.find(v => v.isDefault)
      setSelectedVariantId(defaultVariant ? defaultVariant.id : product.variants?.[0]?.id)
      setSelectedOptions({})
      setNotes("")
    }
  }, [product])

  if (!product) return null

  const displayName = locale === "km" && product.nameKm ? product.nameKm : product.nameEn
  const displayDesc = locale === "km" && product.descriptionKm ? product.descriptionKm : product.descriptionEn
  
  const primaryImage = product.primaryImage?.imageUrl || 
                       product.images?.find(img => img.isPrimary)?.imageUrl || 
                       product.images?.[0]?.imageUrl

  const variants = product.variants || []
  const optionGroups = product.optionGroups || []

  // Helpers for options
  const handleToggleOption = (groupId: string, optionId: string, minSelect: number, maxSelect: number) => {
    setSelectedOptions(prev => {
      const groupSelections = prev[groupId] || []
      if (groupSelections.includes(optionId)) {
        return { ...prev, [groupId]: groupSelections.filter(id => id !== optionId) }
      }
      
      // If adding exceeds maxSelect, don't add (or could pop the oldest)
      if (maxSelect === 1) {
        return { ...prev, [groupId]: [optionId] } // Radio behavior
      }
      if (groupSelections.length >= maxSelect) {
        return prev
      }
      return { ...prev, [groupId]: [...groupSelections, optionId] }
    })
  }

  // Calculate price
  let basePrice = product.basePriceCents || 0
  if (selectedVariantId) {
    const variant = variants.find(v => v.id === selectedVariantId)
    if (variant) basePrice = variant.priceCents
  }

  let addonsPrice = 0
  const addonsResult: CartItemAddon[] = []
  optionGroups.forEach(group => {
    const selections = selectedOptions[group.id] || []
    selections.forEach(optId => {
      const opt = group.options?.find(o => o.id === optId)
      if (opt) {
        addonsPrice += opt.priceDeltaCents
        addonsResult.push({
          groupId: group.id,
          optionId: opt.id,
          name: locale === "km" && opt.nameKm ? opt.nameKm : opt.nameEn,
          priceDeltaCents: opt.priceDeltaCents
        })
      }
    })
  })

  const unitPrice = basePrice + addonsPrice
  const totalPrice = unitPrice * quantity

  // Validate required options
  const isValid = optionGroups.every(group => {
    const count = (selectedOptions[group.id] || []).length
    return count >= group.minSelect && count <= group.maxSelect
  })

  const handleConfirm = () => {
    if (!isValid) return
    const selectedVariant = variants.find(v => v.id === selectedVariantId)
    onAddToCart({
      menuItemId: product.id,
      variantId: selectedVariantId,
      variantName: selectedVariant
        ? (locale === 'km' && selectedVariant.nameKm ? selectedVariant.nameKm : selectedVariant.nameEn)
        : undefined,
      quantity,
      addons: addonsResult,
      finalPriceCents: unitPrice,
      notes: notes.trim() ? notes.trim() : undefined
    })
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[85vh] md:max-h-[75vh] min-h-[400px]"
          >
            {/* Left Column: Image */}
            <div className="relative h-64 md:h-auto md:w-5/12 shrink-0 bg-zinc-100">
              {primaryImage ? (
                <img src={primaryImage} alt={displayName} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-50 to-rose-50" />
              )}
              {/* Mobile Close Button */}
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-colors md:hidden z-10"
              >
                <X size={16} />
              </button>
            </div>

            {/* Right Column: Content */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white relative">
              {/* Desktop Close Button */}
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 bg-zinc-100 hover:bg-zinc-200 rounded-full hidden md:flex items-center justify-center text-zinc-600 transition-colors z-10"
              >
                <X size={16} />
              </button>

              {/* Header: Title & Description */}
              <div className="p-6 md:p-8 pb-4 shrink-0">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-900 pr-8">{displayName}</h2>
                {displayDesc && <p className="text-zinc-500 text-sm mt-2 leading-relaxed">{displayDesc}</p>}
              </div>

              {/* Scrollable Content (Variants & Options) */}
              {(variants.length > 0 || optionGroups.length > 0) ? (
                <div className="flex-1 overflow-y-auto px-6 md:px-8 pb-6 space-y-8">
                  {/* Variants */}
                  {variants.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-[17px] font-bold text-zinc-900 flex items-center">
                        {locale === "km" && variants[0].attributeNameKm ? variants[0].attributeNameKm : variants[0].attributeNameEn}
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary text-white ml-2">Required</span>
                        <span className="text-xs font-semibold text-zinc-400 ml-auto">Select 1</span>
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {variants.map(variant => {
                          const vName = locale === "km" && variant.nameKm ? variant.nameKm : variant.nameEn
                          const isSelected = selectedVariantId === variant.id
                          return (
                            <div
                              key={variant.id}
                              onClick={() => setSelectedVariantId(variant.id)}
                              className={cn(
                                "p-3 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center justify-center text-center gap-1",
                                isSelected 
                                  ? "border-primary bg-primary/5 text-primary shadow-sm"
                                  : "border-zinc-200 bg-white hover:border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                              )}
                            >
                              <span className="font-semibold text-sm">{vName}</span>
                              <span className={cn("text-xs font-medium", isSelected ? "text-primary/70" : "text-zinc-500")}>
                                ${(variant.priceCents / 100).toFixed(2)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add-on Groups */}
                  {optionGroups.map(group => {
                    const gName = locale === "km" && group.nameKm ? group.nameKm : group.nameEn
                    const selectedCount = (selectedOptions[group.id] || []).length
                    const isSatisfied = selectedCount >= group.minSelect && selectedCount <= group.maxSelect
                    
                    return (
                      <div key={group.id} className="space-y-3">
                        <div className="flex items-center">
                          <h3 className="text-[17px] font-bold text-zinc-900 flex items-center">
                            {gName}
                            {group.minSelect > 0 ? (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary text-white ml-2">Required</span>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 ml-2">Optional</span>
                            )}
                          </h3>
                          <span className="text-xs font-semibold text-zinc-400 ml-auto">
                            {group.minSelect === group.maxSelect 
                              ? `Select ${group.minSelect}`
                              : `Pick up to ${group.maxSelect}`
                            }
                          </span>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          {group.options?.map(opt => {
                            const oName = locale === "km" && opt.nameKm ? opt.nameKm : opt.nameEn
                            const isSelected = (selectedOptions[group.id] || []).includes(opt.id)
                            const disabled = !isSelected && selectedCount >= group.maxSelect

                            return (
                              <div 
                                key={opt.id}
                                onClick={() => !disabled && handleToggleOption(group.id, opt.id, group.minSelect, group.maxSelect)}
                                className={cn(
                                  "flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer",
                                  isSelected 
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : disabled 
                                      ? "border-zinc-100 bg-zinc-50 opacity-50 cursor-not-allowed" 
                                      : "border-zinc-200 bg-white hover:border-zinc-300"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-5 h-5 rounded-md flex items-center justify-center border transition-colors",
                                    group.maxSelect === 1 ? "rounded-full" : "rounded-md",
                                    isSelected ? "bg-primary border-primary text-white" : "border-zinc-300 bg-white"
                                  )}>
                                    {isSelected && <div className={cn("bg-white", group.maxSelect === 1 ? "w-2 h-2 rounded-full" : "w-2.5 h-2.5")} />}
                                  </div>
                                  <span className={cn("text-sm font-medium", isSelected ? "text-primary" : "text-zinc-700")}>{oName}</span>
                                </div>
                                {opt.priceDeltaCents > 0 && (
                                  <span className={cn("text-sm font-medium", isSelected ? "text-primary/80" : "text-zinc-500")}>
                                    +${(opt.priceDeltaCents / 100).toFixed(2)}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  {/* Special Instructions */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-[17px] font-bold text-zinc-900">Special Instructions</h3>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="E.g. No ice, extra sauce..."
                      className="w-full p-4 rounded-2xl border border-zinc-200 bg-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none h-28 text-[15px] transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-6 md:px-8 pb-6 pt-6">
                  <div className="space-y-3">
                    <h3 className="text-[17px] font-bold text-zinc-900">Special Instructions</h3>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="E.g. No ice, extra sauce..."
                      className="w-full p-4 rounded-2xl border border-zinc-200 bg-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none h-28 text-[15px] transition-all"
                    />
                  </div>
                </div>
              )}



              {/* Footer / Add to Cart */}
              <div className="p-5 md:p-6 bg-white border-t border-zinc-100 flex flex-col sm:flex-row items-center gap-4 shrink-0">
              <div className="flex items-center justify-center gap-4 bg-zinc-100 rounded-2xl p-1.5 w-full sm:w-auto shrink-0">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-zinc-600 hover:text-rose-500 shadow-sm transition-colors"
                >
                  <Minus size={18} />
                </button>
                <span className="text-[16px] font-semibold w-8 text-center">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-primary shadow-sm hover:bg-primary hover:text-white transition-colors"
                >
                  <Plus size={18} />
                </button>
              </div>

              <Button
                onClick={handleConfirm}
                disabled={!isValid}
                className="flex-1 w-full h-14 bg-primary hover:bg-primary/90 text-white rounded-2xl disabled:opacity-50 text-[15px] transition-all active:scale-[0.98] flex items-center justify-between px-6"
              >
                <span>Add to Order</span>
                <span className="font-bold">${(totalPrice / 100).toFixed(2)}</span>
              </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
