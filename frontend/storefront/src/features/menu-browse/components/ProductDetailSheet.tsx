"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/providers/locale-provider";
import { useCart } from "@/features/cart";

import { ProductHeroImage } from "./product-detail/ProductHeroImage";
import { ProductInfo } from "./product-detail/ProductInfo";
import { ModifierGroup } from "./product-detail/ModifierGroup";
import { SpecialInstructions } from "./product-detail/SpecialInstructions";
import { CartActionBar } from "./product-detail/CartActionBar";

export interface ProductDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  product: any; 
}

export const ProductDetailSheet = ({ isOpen, onClose, product }: ProductDetailSheetProps) => {
  const { locale } = useLocale();
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [instructions, setInstructions] = useState("");
  
  // Dynamic selections: Record<groupId, optionId[]>
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  // Normalize variants (flat array) to grouped templates
  const normalizedVariants = useMemo(() => {
    if (!product || !product.variants || product.variants.length === 0) return [];
    if (product.variants[0]?.variants) return product.variants;

    const groups: { [key: string]: any } = {};

    product.variants.forEach((v: any) => {
      const attrNameEn = v.attributeNameEn || "Sizes";
      const attrNameKm = v.attributeNameKm || attrNameEn;

      if (!groups[attrNameEn]) {
        groups[attrNameEn] = {
          id: `group-${attrNameEn.toLowerCase().replace(/\s+/g, '-')}`,
          nameEn: attrNameEn,
          nameKm: attrNameKm,
          isDefault: false,
          defaultVariantId: "",
          variants: []
        };
      }

      if (v.isDefault) {
        groups[attrNameEn].isDefault = true;
        groups[attrNameEn].defaultVariantId = v.id;
      }

      groups[attrNameEn].variants.push({
        id: v.id,
        nameEn: v.nameEn,
        nameKm: v.nameKm || "",
        price: v.price !== undefined ? v.price : ((v.priceCents || 0) / 100),
        isAvailable: v.isAvailable !== false,
        isDefault: !!v.isDefault
      });
    });

    const result = Object.values(groups);
    if (result.length > 0) {
      const hasDefault = result.some(t => t.isDefault);
      if (!hasDefault) {
        result[0].isDefault = true;
      }
      result.forEach(t => {
        if (!t.defaultVariantId && t.variants.length > 0) {
          const defaultVar = t.variants.find((v: any) => v.isDefault) || t.variants[0];
          t.defaultVariantId = defaultVar.id;
        }
      });
    }
    return result;
  }, [product]);

  // Find active template (default template or first one)
  const activeTemplate = useMemo(() => {
    if (!normalizedVariants || normalizedVariants.length === 0) return null;
    return normalizedVariants.find((t: any) => t.isDefault) || normalizedVariants[0];
  }, [normalizedVariants]);

  // If active template exists, form the "Size" selector group
  const sizeGroup = useMemo(() => {
    if (!activeTemplate || !activeTemplate.variants || activeTemplate.variants.length === 0) return null;
    
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
    };
  }, [activeTemplate]);

  // Get active size variant selection
  const selectedSizeVariant = useMemo(() => {
    if (!activeTemplate || !activeTemplate.variants || activeTemplate.variants.length === 0) return null;
    const selectedId = selections["size-group"]?.[0];
    const found = activeTemplate.variants.find((v: any) => v.id === selectedId);
    if (found) return found;
    
    // Fallback to active template default
    const defaultVar = activeTemplate.variants.find((v: any) => v.id === activeTemplate.defaultVariantId) || activeTemplate.variants[0];
    return defaultVar;
  }, [activeTemplate, selections]);

  // Calculate prices and validation
  const { subtotal, isReadyToAdd, totalDelta } = useMemo(() => {
    if (!product) return { subtotal: 0, isReadyToAdd: false, totalDelta: 0 };
    
    let base = (product.basePriceCents || 0) / 100;
    
    // Replace base price with size variant if selected!
    if (selectedSizeVariant) {
      base = selectedSizeVariant.price !== undefined ? selectedSizeVariant.price : (selectedSizeVariant.priceCents / 100);
    }
    
    let delta = 0;
    let ready = true;

    // Check option groups
    (product.optionGroups || []).forEach((group: any) => {
      const selectedIds = selections[group.id] || [];
      
      // Validation: Min selection
      if (group.minSelect > 0 && selectedIds.length < group.minSelect) {
        ready = false;
      }
      
      // Pricing
      selectedIds.forEach(optId => {
        const option = group.options?.find((o: any) => o.id === optId);
        if (option) delta += (option.priceDeltaCents / 100);
      });
    });

    const finalSubtotal = (base + delta) * qty;

    return { subtotal: finalSubtotal, isReadyToAdd: ready, totalDelta: delta };
  }, [product, selectedSizeVariant, selections, qty]);

  // Handlers
  const handleOptionSelect = (groupId: string, optionId: string, selectionType: "single" | "multiple") => {
    setSelections(prev => {
      const current = prev[groupId] || [];
      if (selectionType === "single") {
        return { ...prev, [groupId]: [optionId] };
      } else {
        if (current.includes(optionId)) {
          return { ...prev, [groupId]: current.filter(id => id !== optionId) };
        } else {
          // Check max selection
          const group = product.optionGroups.find((g: any) => g.id === groupId);
          if (group && group.maxSelect > 0 && current.length >= group.maxSelect) {
            return prev; 
          }
          return { ...prev, [groupId]: [...current, optionId] };
        }
      }
    });
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setQty(1);
      setInstructions("");
      
      // Initialize size selection if activeTemplate exists
      if (activeTemplate && activeTemplate.variants && activeTemplate.variants.length > 0) {
        const defaultVar = activeTemplate.variants.find((v: any) => v.id === activeTemplate.defaultVariantId) || activeTemplate.variants[0];
        setSelections({
          "size-group": [defaultVar.id]
        });
      } else {
        setSelections({});
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, product?.id, activeTemplate]);

  if (!product) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm"
          />

          <div className="fixed inset-0 z-[9999] pointer-events-none flex flex-col justify-end md:justify-center items-center px-0">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="pointer-events-auto w-full h-full md:h-[90vh] max-w-lg md:max-w-[900px] bg-[#F5F5F7] md:rounded-[32px] overflow-hidden flex flex-col md:flex-row shadow-2xl relative"
            >
            <div className="hidden md:block md:w-1/2 h-full relative shrink-0">
              <ProductHeroImage 
                imageUrl={product.imageUrl}
                images={product.images}
                name={locale === "km" ? (product.nameKm || product.nameEn) : (product.nameEn || product.nameKm)} 
                onClose={onClose} 
                productId={product.id}
              />
            </div>

            <div className="flex-1 flex flex-col w-full md:w-1/2 h-full bg-[#F5F5F7] relative">
              <div className="flex-1 overflow-y-auto no-scrollbar pb-32 md:pb-28">
                <div className="md:hidden">
                  <ProductHeroImage 
                    imageUrl={product.imageUrl}
                    images={product.images}
                    name={locale === "km" ? (product.nameKm || product.nameEn) : (product.nameEn || product.nameKm)} 
                    onClose={onClose} 
                    productId={product.id}
                  />
                </div>

                <div className="px-6 pb-6 pt-2 md:pt-8">
                  <ProductInfo 
                    name={locale === "km" ? (product.nameKm || product.nameEn) : (product.nameEn || product.nameKm)} 
                    price={selectedSizeVariant ? (selectedSizeVariant.price ?? (selectedSizeVariant.priceCents / 100)) : ((product.basePriceCents || 0) / 100)} 
                    description={locale === "km" ? (product.descriptionKm || product.descriptionEn) : (product.descriptionEn || product.descriptionKm)} 
                  />

                  {/* Render Size Selector Group */}
                  {sizeGroup && (
                    <ModifierGroup 
                      key="size-group"
                      title={locale === "km" ? (sizeGroup.nameKm || sizeGroup.nameEn) : (sizeGroup.nameEn || sizeGroup.nameKm)}
                      isRequired={true}
                      selectionType="single"
                      isAbsolute={true}
                      options={sizeGroup.options.map((opt: any) => ({
                        id: opt.id,
                        name: locale === "km" ? (opt.nameKm || opt.nameEn) : (opt.nameEn || opt.nameKm),
                        price: opt.price, // absolute price
                        image: undefined
                      }))}
                      selectedIds={selections["size-group"] || []}
                      onSelect={(optId) => handleOptionSelect("size-group", optId, "single")}
                    />
                  )}

                  {product.optionGroups?.map((group: any) => (
                    <ModifierGroup 
                      key={group.id}
                      title={locale === "km" ? (group.nameKm || group.nameEn) : (group.nameEn || group.nameKm)}
                      isRequired={group.minSelect > 0}
                      selectionType={group.maxSelect === 1 ? "single" : "multiple"}
                      options={group.options?.map((opt: any) => ({
                        id: opt.id,
                        name: locale === "km" ? (opt.nameKm || opt.nameEn) : (opt.nameEn || opt.nameKm),
                        price: opt.priceDeltaCents / 100,
                        image: opt.imageUrl
                      })) || []}
                      selectedIds={selections[group.id] || []}
                      onSelect={(optId) => handleOptionSelect(group.id, optId, group.maxSelect === 1 ? "single" : "multiple")}
                    />
                  ))}

                  <SpecialInstructions 
                    value={instructions} 
                    onChange={setInstructions} 
                  />
                </div>
              </div>

              <CartActionBar 
                qty={qty}
                onQtyChange={setQty}
                subtotal={subtotal}
                isReadyToAdd={isReadyToAdd}
                onAddToCart={() => {
                  const activePriceCents = selectedSizeVariant 
                    ? (selectedSizeVariant.priceCents ?? (selectedSizeVariant.price * 100))
                    : (product.basePriceCents || 0);

                  const totalDeltaCents = totalDelta * 100;

                  addItem.mutate({
                    menuItemId: product.id,
                    quantity: qty,
                    unitPriceCents: Math.round(activePriceCents + totalDeltaCents),
                    notes: instructions.trim() || undefined,
                    variantId: selections["size-group"] ? selections["size-group"][0] : undefined,
                    optionIds: Object.entries(selections)
                      .filter(([k]) => k !== "size-group")
                      .flatMap(([_, v]) => v) 
                  });
                  onClose();
                }}
              />
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
