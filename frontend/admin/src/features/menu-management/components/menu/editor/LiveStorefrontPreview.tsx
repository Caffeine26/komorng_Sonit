"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Award, Clock, CheckCircle2, Circle, ImagePlus, Check } from "lucide-react"
import { MenuItem } from "../../../types"
import { cn } from "@/lib/utils/cn"

interface LiveStorefrontPreviewProps {
  item: MenuItem
  attachedVariants: any[]
  attachedGroups: any[]
}

export function LiveStorefrontPreview({ item, attachedVariants, attachedGroups }: LiveStorefrontPreviewProps) {
  const [activeImageIdx, setActiveImageIdx] = useState(0)
  const [qty, setQty] = useState(1)
  const [instructions, setInstructions] = useState("")
  
  // selections state: Record<groupId, optionId[]>
  const [selections, setSelections] = useState<Record<string, string[]>>({})

  // Collect all available product images
  const images = useMemo(() => {
    const list: string[] = []
    if (item.images && item.images.length > 0) {
      item.images.forEach(img => {
        if (img.imageUrl) list.push(img.imageUrl)
      })
    }
    if (item.primaryImage?.imageUrl && !list.includes(item.primaryImage.imageUrl)) {
      list.push(item.primaryImage.imageUrl)
    }
    return list
  }, [item])

  // Autoplay slideshow
  useEffect(() => {
    if (images.length <= 1) return
    const interval = setInterval(() => {
      setActiveImageIdx(prev => (prev + 1) % images.length)
    }, 3500)
    return () => clearInterval(interval)
  }, [images])

  // Normalize attachedVariants (flat array or grouped templates) to grouped templates
  const normalizedVariants = useMemo(() => {
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

  // Find active template (default template or first one)
  const activeTemplate = useMemo(() => {
    if (!normalizedVariants || normalizedVariants.length === 0) return null
    return normalizedVariants.find(t => t.isDefault) || normalizedVariants[0]
  }, [normalizedVariants])

  // If active template exists, form the "Size" selector
  const sizeGroup = useMemo(() => {
    if (!activeTemplate || !activeTemplate.variants || activeTemplate.variants.length === 0) return null
    
    return {
      id: "size-group",
      nameEn: activeTemplate.nameEn || "Select Size",
      nameKm: activeTemplate.nameKm || "ជ្រើសរើសទំហំ",
      minSelect: 1,
      maxSelect: 1,
      options: activeTemplate.variants.map((v: any) => ({
        id: v.id,
        nameEn: v.nameEn,
        nameKm: v.nameKm || "",
        price: v.price !== undefined ? v.price : (v.priceCents / 100),
        isAvailable: v.isAvailable
      }))
    }
  }, [activeTemplate])

  // Get active size variant selection
  const selectedSizeVariant = useMemo(() => {
    if (!activeTemplate || !activeTemplate.variants || activeTemplate.variants.length === 0) return null
    const selectedId = selections["size-group"]?.[0]
    const found = activeTemplate.variants.find((v: any) => v.id === selectedId)
    if (found) return found
    
    // Fallback to active template default
    const defaultVar = activeTemplate.variants.find((v: any) => v.id === activeTemplate.defaultVariantId) || activeTemplate.variants[0]
    return defaultVar
  }, [activeTemplate, selections])

  // Initialize default variant selection
  useEffect(() => {
    if (activeTemplate && activeTemplate.variants && activeTemplate.variants.length > 0) {
      const defaultVar = activeTemplate.variants.find((v: any) => v.id === activeTemplate.defaultVariantId) || activeTemplate.variants[0]
      setSelections(prev => ({
        ...prev,
        "size-group": [defaultVar.id]
      }))
    } else {
      setSelections(prev => {
        const next = { ...prev }
        delete next["size-group"]
        return next
      })
    }
  }, [activeTemplate])

  // Calculate dynamic subtotal and validation
  const { subtotal, isReadyToAdd } = useMemo(() => {
    let price = (item.basePriceCents || 0) / 100
    let ready = true

    // Check size variant (replaces base price!)
    if (selectedSizeVariant) {
      price = selectedSizeVariant.price !== undefined ? selectedSizeVariant.price : (selectedSizeVariant.priceCents / 100)
    }

    // Check custom option groups
    attachedGroups.forEach((group) => {
      const selectedIds = selections[group.id] || []
      
      // Validation: Min selection
      if (group.minSelect > 0 && selectedIds.length < group.minSelect) {
        ready = false
      }
      
      // Pricing
      selectedIds.forEach(optId => {
        const option = group.options?.find((o: any) => o.id === optId)
        if (option) {
          const delta = option.priceDelta !== undefined ? option.priceDelta : (option.priceDeltaCents / 100)
          price += delta
        }
      })
    })

    const finalSubtotal = price * qty

    return { subtotal: finalSubtotal, isReadyToAdd: ready }
  }, [item, selectedSizeVariant, attachedGroups, selections, qty])

  const handleOptionSelect = (groupId: string, optionId: string, selectionType: "single" | "multiple") => {
    setSelections(prev => {
      const current = prev[groupId] || []
      if (selectionType === "single") {
        return { ...prev, [groupId]: [optionId] }
      } else {
        if (current.includes(optionId)) {
          return { ...prev, [groupId]: current.filter(id => id !== optionId) }
        } else {
          const group = attachedGroups.find((g: any) => g.id === groupId)
          if (group && group.maxSelect > 0 && current.length >= group.maxSelect) {
            return prev 
          }
          return { ...prev, [groupId]: [...current, optionId] }
        }
      }
    })
  }

  return (
    <div className="w-full flex flex-col bg-zinc-50 border border-zinc-200/60 rounded-3xl overflow-hidden shadow-sm">
      {/* Product Image Section */}
      <div className="w-full aspect-[4/3] relative bg-zinc-150 flex items-center justify-center shrink-0 border-b border-zinc-100 group overflow-hidden">
        {images.length > 0 ? (
          <div className="w-full h-full relative">
            <img 
              src={images[activeImageIdx]} 
              alt={item.nameEn} 
              className="w-full h-full object-cover transition-all duration-500 ease-in-out" 
            />
            
            {/* Carousel navigation indicators */}
            {images.length > 1 && (
              <>
                {/* Dots indicator */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-20">
                  {images.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImageIdx(idx)}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all duration-300",
                        idx === activeImageIdx 
                          ? "bg-[var(--color-brand)] w-3" 
                          : "bg-white/60 hover:bg-white"
                      )}
                    />
                  ))}
                </div>

                {/* Left/Right hover arrows */}
                <button
                  onClick={() => setActiveImageIdx(prev => (prev - 1 + images.length) % images.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center text-zinc-800 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity active:scale-95 z-20 font-bold"
                >
                  ‹
                </button>
                <button
                  onClick={() => setActiveImageIdx(prev => (prev + 1) % images.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center text-zinc-800 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity active:scale-95 z-20 font-bold"
                >
                  ›
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-500">
            <ImagePlus className="w-8 h-8" />
            <span className="text-[11px] font-semibold">No photo uploaded</span>
          </div>
        )}
      </div>

      {/* Product Content Details */}
      <div className="p-5 pb-24 flex-1">
        {/* Product Info */}
        <div className="flex justify-between items-start gap-4 mb-3">
          <div>
            <h1 className="font-bold text-[18px] text-zinc-950 leading-tight">
              {item.nameEn}
            </h1>
            {item.nameKm && (
              <span className="text-[12px] text-zinc-500 font-medium block mt-0.5">
                {item.nameKm}
              </span>
            )}
          </div>
          <span className="font-semibold text-[16px] text-zinc-950 shrink-0">
            ${selectedSizeVariant 
              ? (selectedSizeVariant.price !== undefined ? selectedSizeVariant.price.toFixed(2) : (selectedSizeVariant.priceCents / 100).toFixed(2))
              : ((item.basePriceCents || 0) / 100).toFixed(2)}
          </span>
        </div>
        
        <p className="text-[12px] text-zinc-500 font-medium leading-relaxed mb-4">
          {item.descriptionEn || "Delicious fresh and high-quality preparation, customized exactly to your order."}
        </p>

        <div className="flex flex-wrap gap-1.5 mb-5 border-b border-zinc-200/50 pb-4">
          <div className="flex items-center gap-1 px-2 py-0.5 bg-white rounded-full border border-zinc-200 shadow-2xs">
            <Award size={11} className="text-zinc-500" />
            <span className="text-[9px] font-bold text-zinc-650">Best seller</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 bg-white rounded-full border border-zinc-200 shadow-2xs">
            <Clock size={11} className="text-zinc-500" />
            <span className="text-[9px] font-bold text-zinc-650">15-20 min</span>
          </div>
        </div>

        {/* Size / Variant Options */}
        {sizeGroup && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-[13px] text-zinc-900">{sizeGroup.nameEn}</h3>
                <span className="px-1.5 py-0.5 bg-[var(--color-brand)] text-white text-[8px] font-bold rounded-md">Required</span>
              </div>
              <span className="text-[10px] font-bold text-zinc-500">Select 1</span>
            </div>
            
            <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs divide-y divide-zinc-100 overflow-hidden">
              {sizeGroup.options.map((opt: any, idx: number) => {
                const isSelected = selections["size-group"]?.includes(opt.id)
                const initials = opt.nameEn.substring(0, 2).toUpperCase()
                return (
                  <button 
                    key={opt.id}
                    onClick={() => handleOptionSelect("size-group", opt.id, "single")}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors",
                      isSelected ? "bg-[var(--color-brand)]/5" : "hover:bg-zinc-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Left: Sleek w-7 initials/avatar */}
                      <div className="w-7 h-7 rounded-full bg-zinc-150 border border-zinc-200 flex items-center justify-center text-[10px] font-semibold text-zinc-500 shrink-0 select-none">
                        {initials}
                      </div>

                      {/* Middle: Sleek Name and Subname */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-zinc-900 truncate">{opt.nameEn}</p>
                        {opt.nameKm && (
                          <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{opt.nameKm}</p>
                        )}
                      </div>
                    </div>

                    {/* Right: Absolute Price + Sleek Selection */}
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <span className="text-[12px] font-medium text-zinc-500">
                        ${opt.price.toFixed(2)}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 size={18} className="text-[var(--color-brand)] fill-[var(--color-brand)]/10" strokeWidth={1.6} />
                      ) : (
                        <Circle size={18} className="text-zinc-300" strokeWidth={1.5} />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Custom Option Groups */}
        {attachedGroups.map((group) => (
          <div key={group.id} className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-[13px] text-zinc-900">{group.nameEn}</h3>
                {group.minSelect > 0 ? (
                  <span className="px-1.5 py-0.5 bg-[var(--color-brand)] text-white text-[8px] font-bold rounded-md">Required</span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-zinc-200 text-zinc-500 text-[8px] font-bold rounded-md">Optional</span>
                )}
              </div>
              <span className="text-[10px] font-bold text-zinc-500">
                {group.minSelect > 0 ? `Select ${group.minSelect}` : "Pick N"}
              </span>
            </div>
            
            <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs divide-y divide-zinc-100 overflow-hidden">
              {group.options?.map((opt: any, idx: number) => {
                const isSelected = selections[group.id]?.includes(opt.id)
                const isSingleSelect = group.maxSelect === 1
                const delta = opt.priceDelta !== undefined ? opt.priceDelta : (opt.priceDeltaCents / 100)
                const initials = opt.nameEn.substring(0, 2).toUpperCase()
                const isRequiredGroup = group.minSelect > 0
                
                return (
                  <button 
                    key={opt.id}
                    onClick={() => handleOptionSelect(group.id, opt.id, isSingleSelect ? "single" : "multiple")}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors",
                      isSelected ? (isRequiredGroup ? "bg-[var(--color-brand)]/5" : "bg-emerald-500/[0.04]") : "hover:bg-zinc-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Left: Sleek w-7 initials/avatar */}
                      {opt.imageUrl ? (
                        <div className="w-7 h-7 rounded-full bg-zinc-100 overflow-hidden relative shadow-sm border border-black/5 shrink-0">
                          <img src={opt.imageUrl} alt={opt.nameEn} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-zinc-150 border border-zinc-200 flex items-center justify-center text-[10px] font-semibold text-zinc-500 shrink-0 select-none">
                          {initials}
                        </div>
                      )}

                      {/* Middle: Sleek Name and Subname */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-zinc-900 truncate">{opt.nameEn}</p>
                        {opt.nameKm && (
                          <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{opt.nameKm}</p>
                        )}
                      </div>
                    </div>

                    {/* Right: Sleek selection indicator + delta */}
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {delta > 0 && (
                        <span className="text-[12px] font-medium text-emerald-600">
                          +${delta.toFixed(2)}
                        </span>
                      )}
                      {isSelected ? (
                        <CheckCircle2 
                          size={18} 
                          className={isRequiredGroup ? "text-[var(--color-brand)] fill-[var(--color-brand)]/10" : "text-emerald-600 fill-emerald-600/10"} 
                          strokeWidth={1.6} 
                        />
                      ) : (
                        <Circle size={18} className="text-zinc-300" strokeWidth={1.5} />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Special Instructions */}
        <div className="mb-4">
          <h3 className="font-bold text-[13px] text-zinc-900 mb-2">Special Instructions</h3>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="E.g. No ice, extra sauce..."
            className="w-full text-[11px] p-3 rounded-2xl bg-white border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)] resize-none h-16"
          />
        </div>
      </div>

      {/* Cart Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-zinc-200/80 p-4 pb-5 flex items-center justify-between gap-3 shadow-lg z-40 shrink-0 rounded-b-3xl">
        <div className="flex items-center gap-3 bg-zinc-100 rounded-full px-2.5 py-1.5 border border-zinc-200/50">
          <button 
            onClick={() => setQty(Math.max(1, qty - 1))}
            className="w-5 h-5 rounded-full flex items-center justify-center text-zinc-500 font-bold hover:bg-zinc-200/80 transition-colors"
          >
            -
          </button>
          <span className="text-[13px] font-bold text-zinc-950 w-4 text-center">{qty}</span>
          <button 
            onClick={() => setQty(qty + 1)}
            className="w-5 h-5 rounded-full flex items-center justify-center text-zinc-500 font-bold hover:bg-zinc-200/80 transition-colors"
          >
            +
          </button>
        </div>

        <button 
          disabled={!isReadyToAdd}
          className={cn(
            "flex-1 h-10 rounded-full text-white text-[12.5px] font-semibold shadow-md transition-all flex items-center justify-between px-5",
            isReadyToAdd ? "bg-[var(--color-brand)] hover:bg-[#d65516] active:scale-[0.98]" : "bg-zinc-350 cursor-not-allowed shadow-none"
          )}
        >
          <span>Add to order</span>
          <span>${subtotal.toFixed(2)}</span>
        </button>
      </div>
    </div>
  )
}
