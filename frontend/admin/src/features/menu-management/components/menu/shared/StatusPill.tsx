"use client"

import { cn } from "@/lib/utils/cn"

interface StatusPillProps {
  value: boolean
  labelTrue: string
  labelFalse: string
  onToggle?: (newValue: boolean) => void
}

export function StatusPill({ value, labelTrue, labelFalse, onToggle }: StatusPillProps) {
  return (
    <div className="flex items-center justify-center">
      <button
        onClick={() => onToggle?.(!value)}
        className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-normal transition-all duration-300 border focus:outline-none flex items-center gap-1 shadow-xs cursor-pointer select-none",
          value
            ? "bg-emerald-50 text-emerald-700 border-emerald-150/60 hover:bg-emerald-100/50"
            : "bg-rose-50 text-rose-700 border-rose-150/60 hover:bg-rose-100/50"
        )}
      >
        <span className={cn("w-1 h-1 rounded-full", value ? "bg-emerald-500" : "bg-rose-500")} />
        {value ? labelTrue : labelFalse}
      </button>
    </div>
  )
}
