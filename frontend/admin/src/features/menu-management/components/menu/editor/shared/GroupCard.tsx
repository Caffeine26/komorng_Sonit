"use client"

import React from "react"
import { X, Check } from "lucide-react"
import { cn } from "@/lib/utils/cn"

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
}

export function formatDelta(cents: number): { label: string; cls: string } {
  if (!cents || cents === 0) return { label: "$0", cls: "opt-price-zero" }
  if (cents > 0) return { label: `+$${(cents / 100).toFixed(2)}`, cls: "opt-price-pos" }
  return { label: `-$${(Math.abs(cents) / 100).toFixed(2)}`, cls: "opt-price-neg" }
}

export function getRuleText(min: number, max: number): string {
  if (min === 0 && max === 1) return "Pick 0–1"
  if (min === 1 && max === 1) return "Pick 1"
  if (min === 0 && max > 1) return `Pick 0–${max}`
  if (min >= 1 && max > 1) return `Pick ${min}–${max}`
  return "Custom"
}

// ─── Shared option list (used on BOTH left and right panels) ─────────────────

export function OptionList({ options }: { options: any[] }) {
  return (
    <div className="flex flex-col divide-y divide-zinc-100">
      {options.map((opt) => {
        const { label, cls } = formatDelta(opt.priceDeltaCents ?? 0)
        const initials = getInitials(opt.nameEn || "?")
        const isAvail = opt.isAvailable !== false

        return (
          <div
            key={opt.id}
            className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-zinc-50/60 transition-colors"
          >
            {/* Avatar circle / image fallback */}
            {opt.imageUrl || opt.image ? (
              <div className="w-6 h-6 rounded-full bg-zinc-100 border border-zinc-200 overflow-hidden flex-shrink-0 relative select-none">
                <img
                  src={opt.imageUrl || opt.image}
                  alt={opt.nameEn}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-[9px] font-semibold text-zinc-500 flex-shrink-0 select-none">
                {initials}
              </div>
            )}

            {/* Name */}
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-zinc-900 truncate">{opt.nameEn}</p>
                {opt.nameKm && (
                  <p className="text-[9px] text-zinc-450 mt-0.5 truncate">{opt.nameKm}</p>
                )}
              </div>
              {opt.isDefault && (
                <span className="text-[8px] font-bold text-amber-600 bg-amber-50 border border-amber-200/50 px-1 py-0.5 rounded-md flex-shrink-0 select-none">
                  Default
                </span>
              )}
            </div>

            {/* Price delta */}
            <span
              className={cn(
                "text-[11px] font-semibold flex-shrink-0",
                cls === "opt-price-pos" && "text-emerald-600",
                cls === "opt-price-zero" && "text-zinc-400",
                cls === "opt-price-neg" && "text-red-500"
              )}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Shared card header (used on BOTH panels) ─────────────────────────────────

export function GroupCardHeader({
  group,
  isAttached,
  onEdit,
  onDelete,
  onDetach,
  showLibraryActions = false,
}: {
  group: any
  isAttached?: boolean
  onEdit?: () => void
  onDelete?: () => void
  onDetach?: () => void
  showLibraryActions?: boolean
}) {
  const isRequired = (group.minSelect ?? 0) > 0

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 border-b border-zinc-100",
        isAttached ? "bg-zinc-50/80" : "bg-zinc-50"
      )}
    >
      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-zinc-900 truncate">{group.nameEn}</p>
        {group.nameKm && (
          <p className="text-[9px] text-zinc-450 mt-0.5 truncate">{group.nameKm}</p>
        )}
      </div>

      {/* Rule badges with thin border lines */}
      <span
        className={cn(
          "text-[8px] font-bold px-1.5 py-0.2 rounded-md flex-shrink-0 border",
          isRequired
            ? "bg-red-50 text-red-650 border-red-200/50"
            : "bg-zinc-100 text-zinc-550 border-zinc-200"
        )}
      >
        {isRequired ? "Req" : "Opt"}
      </span>
      <span className="text-[8px] font-bold bg-orange-50 text-orange-600 border border-orange-200/50 px-1.5 py-0.2 rounded-md flex-shrink-0">
        {getRuleText(group.minSelect ?? 0, group.maxSelect ?? 1)}
      </span>

      {/* Library actions: Edit + Delete + Attached pill */}
      {showLibraryActions && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.() }}
            className="text-[9px] font-semibold text-[var(--color-brand)] bg-orange-50 border border-orange-200/60 px-1.5 py-0.5 rounded-md hover:bg-orange-100 transition-colors cursor-pointer"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.() }}
            className="text-[9px] font-semibold text-red-500 bg-red-50 border border-red-200/60 px-1.5 py-0.5 rounded-md hover:bg-red-100 transition-colors cursor-pointer"
          >
            Del
          </button>
          {isAttached && (
            <span className="flex items-center gap-0.5 text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-250/80">
              <Check className="w-2.5 h-2.5 stroke-[3]" /> Attached
            </span>
          )}
        </div>
      )}

      {/* Right panel: detach button only */}
      {!showLibraryActions && onDetach && (
        <button
          onClick={() => onDetach()}
          className="w-5 h-5 flex items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
          aria-label="Detach"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ─── Unified Group Card ───────────────────────────────────────────────────────

export function GroupCard({
  group,
  isAttached,
  onEdit,
  onDelete,
  onDetach,
  showLibraryActions,
  draggable,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  group: any
  isAttached?: boolean
  onEdit?: () => void
  onDelete?: () => void
  onDetach?: () => void
  showLibraryActions?: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-xl border overflow-hidden select-none transition-colors bg-white",
        isAttached ? "border-zinc-300 shadow-2xs" : "border-zinc-200 hover:border-zinc-300",
        draggable && "cursor-grab"
      )}
    >
      <GroupCardHeader
        group={group}
        isAttached={isAttached}
        onEdit={onEdit}
        onDelete={onDelete}
        onDetach={onDetach}
        showLibraryActions={showLibraryActions}
      />
      <OptionList options={group.options ?? []} />
    </div>
  )
}
