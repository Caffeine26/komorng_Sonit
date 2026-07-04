"use client"

import { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-dashed border-zinc-200 bg-white rounded-[28px] max-w-xl mx-auto shadow-sm">
      <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 mb-4 text-zinc-400">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-base font-semibold text-zinc-900 leading-none">{title}</h3>
      <p className="text-xs text-zinc-455 mt-2 max-w-xs leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-6 shadow-sm">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
