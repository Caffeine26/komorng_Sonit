"use client"

import React, { useState, useCallback, useEffect } from "react"
import { X, Info, Plus, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { createAdminMenuItem, updateAdminMenuItem, createAdminMenuItemVariant, deleteAdminMenuItemVariant } from "@/lib/api/menu"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SizeCard {
  id: number
  nameEn: string
  nameKm: string
  price: string
  cost: string
  sku: string
  isDefault: boolean
  _err?: boolean
}

export interface CreateVariantPayload {
  attributeNameEn: string
  attributeNameKm: string
  nameEn: string
  nameKm: string | null
  priceCents: number
  costCents: number | null
  sku: string | null
  isAvailable: boolean
  isDefault: boolean
  sortOrder: number
}

interface VariantGroupDialogProps {
  open: boolean
  onClose: () => void
  onSave: (payloads: CreateVariantPayload[]) => Promise<void>
  initialData?: any | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _cid = 0
const nextId = () => ++_cid

function makeCard(partial: Partial<SizeCard> = {}): SizeCard {
  return {
    id: nextId(),
    nameEn: "",
    nameKm: "",
    price: "",
    cost: "",
    sku: "",
    isDefault: false,
    ...partial,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({
  children, tag, required, optional,
}: {
  children: React.ReactNode
  tag?: string
  required?: boolean
  optional?: boolean
}) {
  return (
    <label className="text-[11px] font-medium text-zinc-500 flex items-center gap-1.5 flex-wrap">
      {children}
      {required && <span className="text-[var(--color-brand)]">*</span>}
      {optional && <span className="text-zinc-400 font-normal text-[10px]">optional</span>}
      {tag && (
        <span className="font-mono text-[9px] bg-zinc-100 text-zinc-400 border border-zinc-200 px-1.5 py-px rounded">
          {tag}
        </span>
      )}
    </label>
  )
}

function SmallFieldLabel({
  children, tag, required,
}: {
  children: React.ReactNode
  tag?: string
  required?: boolean
}) {
  return (
    <label className="text-[10px] font-medium text-zinc-400 flex items-center gap-1 flex-wrap">
      {children}
      {required && <span className="text-[var(--color-brand)]">*</span>}
      {tag && (
        <span className="font-mono text-[9px] bg-zinc-100 text-zinc-400 border border-zinc-200 px-1.5 py-px rounded">
          {tag}
        </span>
      )}
    </label>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VariantGroupDialog({ open, onClose, onSave, initialData }: VariantGroupDialogProps) {
  const [grpEn, setGrpEn] = useState("")
  const [grpKm, setGrpKm] = useState("")
  const [isAvailable, setIsAvailable] = useState(true)
  const [cards, setCards] = useState<SizeCard[]>(() => [makeCard({ isDefault: true })])
  const [isSaving, setIsSaving] = useState(false)
  const [grpEnErr, setGrpEnErr] = useState(false)

  useEffect(() => {
    if (open) {
      _cid = 0
      setGrpEnErr(false)
      setIsSaving(false)

      if (initialData) {
        setGrpEn(initialData.nameEn || "")
        setGrpKm(initialData.nameKm || "")
        setIsAvailable(initialData.variants?.[0]?.isAvailable !== false)
        
        const mappedCards = (initialData.variants || []).map((v: any, idx: number) => {
          _cid = idx + 1
          return {
            id: _cid,
            nameEn: v.nameEn || "",
            nameKm: v.nameKm || "",
            price: v.price !== undefined ? String(v.price) : "0.00",
            cost: v.cost !== undefined && v.cost !== null && v.cost !== "" ? String(v.cost) : "",
            sku: v.sku || "",
            isDefault: !!v.isDefault,
            _err: false,
          }
        })
        
        if (mappedCards.length === 0) {
          setCards([makeCard({ isDefault: true })])
        } else {
          setCards(mappedCards)
        }
      } else {
        setGrpEn("")
        setGrpKm("")
        setIsAvailable(true)
        setCards([makeCard({ isDefault: true })])
      }
    }
  }, [open, initialData])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && open) onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  const addCard = useCallback(() => {
    setCards(prev => [...prev, makeCard()])
  }, [])

  const deleteCard = useCallback((id: number) => {
    setCards(prev => {
      if (prev.length <= 1) return prev
      const next = prev.filter(c => c.id !== id)
      if (!next.some(c => c.isDefault)) next[0].isDefault = true
      return next
    })
  }, [])

  const setDefault = useCallback((id: number) => {
    setCards(prev => prev.map(c => ({ ...c, isDefault: c.id === id })))
  }, [])

  const updateCard = useCallback((id: number, field: keyof SizeCard, value: string) => {
    setCards(prev =>
      prev.map(c =>
        c.id === id
          ? { ...c, [field]: value, _err: field === "nameEn" ? false : c._err }
          : c
      )
    )
  }, [])

  const handleSave = async () => {
    let valid = true

    if (!grpEn.trim()) {
      setGrpEnErr(true)
      valid = false
    }

    const validated = cards.map(c => ({ ...c, _err: !c.nameEn.trim() }))
    if (validated.some(c => c._err)) {
      setCards(validated)
      valid = false
    }

    if (!valid) return

    const payloads: CreateVariantPayload[] = cards.map((c, i) => ({
      attributeNameEn: grpEn.trim(),
      attributeNameKm: grpKm.trim() || grpEn.trim(),
      nameEn: c.nameEn.trim(),
      nameKm: c.nameKm.trim() || null,
      priceCents: Math.round(parseFloat(c.price || "0") * 100),
      costCents: c.cost ? Math.round(parseFloat(c.cost) * 100) : null,
      sku: c.sku.trim() || null,
      isAvailable,
      isDefault: c.isDefault,
      sortOrder: i,
    }))

    setIsSaving(true)
    try {
      await onSave(payloads)
      onClose()
    } catch (err) {
      console.error("Failed to save variant group:", err)
    } finally {
      setIsSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-[640px] border border-zinc-200 shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-zinc-100 flex-shrink-0">
          <div>
            <h2 className="text-[16px] font-semibold text-zinc-900 leading-tight">
              New variant group
            </h2>
            <p className="text-[12px] text-zinc-400 mt-1">
              Define the sizes or variants available for this product.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md border border-zinc-200 bg-transparent text-zinc-400 hover:bg-zinc-50 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto flex-1 min-h-0">

          {/* Group name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <FieldLabel required>Group name (English)</FieldLabel>
              <input
                className={cn(
                  "h-9 border rounded-lg px-3 text-[13px] text-zinc-900 bg-white outline-none transition-all",
                  grpEnErr
                    ? "border-red-400 focus:ring-[3px] focus:ring-red-500/10"
                    : "border-zinc-200 focus:border-[var(--color-brand)] focus:ring-[3px] focus:ring-[var(--color-brand)]/10"
                )}
                placeholder="e.g. Coffee Sizes, Pizza Sizes"
                value={grpEn}
                onChange={e => { setGrpEn(e.target.value); setGrpEnErr(false) }}
              />
              {grpEnErr && <p className="text-[10px] text-red-500">Group name is required</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel optional>Group name (Khmer)</FieldLabel>
              <input
                className="h-9 border border-zinc-200 rounded-lg px-3 text-[13px] text-zinc-900 bg-white outline-none focus:border-[var(--color-brand)] focus:ring-[3px] focus:ring-[var(--color-brand)]/10 transition-all"
                placeholder="ឧ. ទំហំកាហ្វេ"
                value={grpKm}
                onChange={e => setGrpKm(e.target.value)}
              />
            </div>
          </div>

          {/* Info box */}
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
            <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-blue-700 leading-relaxed">
              Each size price <strong>replaces</strong> the product base price when selected
              by the customer. Use <strong>Set default</strong> to pre-select one size.
            </p>
          </div>

          {/* Available toggle */}
          <div className="border border-zinc-100 rounded-lg">
            <div className="flex items-center justify-between px-3 py-2.5">
              <div>
                <p className="text-[12px] font-medium text-zinc-800">
                  Available
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  All sizes in this group share this availability
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAvailable(v => !v)}
                className={cn(
                  "w-9 h-5 rounded-full flex items-center p-0.5 transition-colors flex-shrink-0",
                  isAvailable ? "bg-[var(--color-brand)]" : "bg-zinc-300"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200",
                  isAvailable ? "ml-auto" : "ml-0"
                )} />
              </button>
            </div>
          </div>

          {/* Section header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[12px] font-semibold text-zinc-900">Size options</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Add each size with its name and price</p>
            </div>
            <button
              type="button"
              onClick={addCard}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-colors mt-0.5 flex-shrink-0"
            >
              <Plus className="w-3 h-3" />
              Add size
            </button>
          </div>

          {/* Size cards */}
          <div className="flex flex-col gap-2.5">
            {cards.map((card, idx) => (
              <div
                key={card.id}
                className={cn(
                  "border rounded-xl overflow-hidden transition-colors",
                  card.isDefault
                    ? "border-[var(--color-brand)]/40 bg-[#FFF7ED]/40"
                    : "border-zinc-200 bg-white"
                )}
              >
                {/* Card header */}
                <div className={cn(
                  "flex items-center justify-between px-3 py-2 border-b",
                  card.isDefault
                    ? "bg-[#FFF7ED]/80 border-[var(--color-brand)]/20"
                    : "bg-zinc-50 border-zinc-100"
                )}>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0",
                      card.isDefault ? "bg-[var(--color-brand)] text-white" : "bg-zinc-200 text-zinc-500"
                    )}>
                      {idx + 1}
                    </div>
                    <span className={cn(
                      "text-[12px] font-medium",
                      card.isDefault ? "text-[var(--color-brand)]" : "text-zinc-500"
                    )}>
                      {card.nameEn || `Size ${idx + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDefault(card.id)}
                      className={cn(
                        "flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md border transition-all",
                        card.isDefault
                          ? "border-[var(--color-brand)]/40 text-[var(--color-brand)] bg-[#FFF7ED]"
                          : "border-zinc-200 text-zinc-400 bg-white hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
                      )}
                    >
                      <div className={cn(
                        "w-3 h-3 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0",
                        card.isDefault ? "border-[var(--color-brand)]" : "border-zinc-300"
                      )}>
                        {card.isDefault && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)]" />
                        )}
                      </div>
                      {card.isDefault ? "Default" : "Set default"}
                    </button>
                    {cards.length > 1 && (
                      <button
                        type="button"
                        onClick={() => deleteCard(card.id)}
                        className="w-6 h-6 rounded-md border border-zinc-200 bg-white text-zinc-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Card body */}
                <div className="p-3 flex flex-col gap-3">

                  {/* nameEn + nameKm */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex flex-col gap-1.5">
                      <SmallFieldLabel required>Size name (English)</SmallFieldLabel>
                      <input
                        className={cn(
                          "h-8 border rounded-lg px-2.5 text-[12px] text-zinc-900 bg-white outline-none transition-all",
                          card._err
                            ? "border-red-400 focus:ring-2 focus:ring-red-500/10"
                            : "border-zinc-200 focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10"
                        )}
                        placeholder="e.g. Small"
                        value={card.nameEn}
                        onChange={e => updateCard(card.id, "nameEn", e.target.value)}
                      />
                      {card._err && <p className="text-[10px] text-red-500">Required</p>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <SmallFieldLabel>Size name (Khmer)</SmallFieldLabel>
                      <input
                        className="h-8 border border-zinc-200 rounded-lg px-2.5 text-[12px] text-zinc-900 bg-white outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10 transition-all"
                        placeholder="ឧ. តូច"
                        value={card.nameKm}
                        onChange={e => updateCard(card.id, "nameKm", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* priceCents + costCents + sku */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="flex flex-col gap-1.5">
                      <SmallFieldLabel required>Price</SmallFieldLabel>
                      <div className="flex items-center border border-zinc-200 rounded-lg overflow-hidden bg-white focus-within:border-[var(--color-brand)] focus-within:ring-2 focus-within:ring-[var(--color-brand)]/10 transition-all">
                        <span className="px-2 text-[11px] text-zinc-400 border-r border-zinc-100 h-8 flex items-center bg-zinc-50 flex-shrink-0">$</span>
                        <input
                          type="number" step="0.01" min="0"
                          className="flex-1 h-8 px-2 text-[12px] text-zinc-900 bg-transparent border-none outline-none min-w-0"
                          placeholder="0.00"
                          value={card.price}
                          onChange={e => updateCard(card.id, "price", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <SmallFieldLabel>Cost</SmallFieldLabel>
                      <div className="flex items-center border border-zinc-200 rounded-lg overflow-hidden bg-white focus-within:border-[var(--color-brand)] focus-within:ring-2 focus-within:ring-[var(--color-brand)]/10 transition-all">
                        <span className="px-2 text-[11px] text-zinc-400 border-r border-zinc-100 h-8 flex items-center bg-zinc-50 flex-shrink-0">$</span>
                        <input
                          type="number" step="0.01" min="0"
                          className="flex-1 h-8 px-2 text-[12px] text-zinc-900 bg-transparent border-none outline-none min-w-0"
                          placeholder="0.00"
                          value={card.cost}
                          onChange={e => updateCard(card.id, "cost", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <SmallFieldLabel>SKU</SmallFieldLabel>
                      <input
                        className="h-8 border border-zinc-200 rounded-lg px-2.5 text-[12px] text-zinc-900 bg-white outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/10 transition-all"
                        placeholder="e.g. SM-001"
                        value={card.sku}
                        onChange={e => updateCard(card.id, "sku", e.target.value)}
                      />
                    </div>
                  </div>

                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-zinc-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-9 px-4 border border-zinc-200 rounded-lg bg-transparent text-zinc-500 text-[12px] font-medium hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="h-9 px-5 bg-[var(--color-brand)] hover:bg-[#D4541A] disabled:opacity-50 text-white rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSaving ? "Saving..." : "Save group"}
          </button>
        </div>

      </div>
    </div>
  )
}

// ─── SizeTemplateFormModal ────────────────────────────────────────────────────
// Wrapper that connects VariantGroupDialog to the GLOBAL_VARIANT_TEMPLATE API pattern.

interface SizeTemplateFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  initialData?: any | null
  tenantSlug: string
}

export function SizeTemplateFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  tenantSlug,
}: SizeTemplateFormModalProps) {
  const handleSave = async (payloads: CreateVariantPayload[]) => {
    if (payloads.length === 0) return

    const groupNameEn = payloads[0].attributeNameEn
    const groupNameKm = payloads[0].attributeNameKm

    let menuItemId: string

    if (initialData) {
      // ── UPDATE: patch the template item name, then rebuild variants ──
      await updateAdminMenuItem("any", initialData.id, {
        id: initialData.id,
        nameEn: groupNameEn,
        nameKm: groupNameKm || groupNameEn,
      } as any, tenantSlug)
      menuItemId = initialData.id

      // Delete all existing variants so we can recreate cleanly
      const existingVariants: any[] = initialData.variants || []
      for (const v of existingVariants) {
        await deleteAdminMenuItemVariant(menuItemId, v.id, tenantSlug)
      }
    } else {
      // ── CREATE: make the template container item first (no variants) ──
      const created = await createAdminMenuItem("any", {
        nameEn: groupNameEn,
        nameKm: groupNameKm || groupNameEn,
        categoryId: null,
        descriptionEn: "GLOBAL_VARIANT_TEMPLATE",
        descriptionKm: null,
        basePriceCents: 0,
        currency: "USD",
        isVisible: false,
        isAvailable: true,
        variants: [],
        optionGroups: [],
        images: [],
      } as any, tenantSlug)
      menuItemId = created.id
    }

    // ── Create each variant via the official variant endpoint ──
    for (let i = 0; i < payloads.length; i++) {
      const p = payloads[i]
      await createAdminMenuItemVariant(menuItemId, {
        nameEn: p.nameEn,
        nameKm: p.nameKm ?? "",
        attributeNameEn: p.attributeNameEn,
        attributeNameKm: p.attributeNameKm,
        priceCents: p.priceCents,
        costCents: p.costCents ?? null,
        sku: p.sku ?? null,
        isAvailable: p.isAvailable,
        isDefault: p.isDefault,
        sortOrder: i + 1,
      }, tenantSlug)
    }

    onSuccess?.()
  }

  return (
    <VariantGroupDialog
      open={isOpen}
      onClose={onClose}
      onSave={handleSave}
      initialData={initialData}
    />
  )
}