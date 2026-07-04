"use client"

import React from "react"
import { motion } from "framer-motion"
import { Edit3, Trash2, ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { useParams } from "next/navigation"
import { useLocale } from "next-intl"
import { MenuItem } from "../types"

interface AdminProductCardVerticalProps {
  product: MenuItem
  onEdit?: () => void
  onDelete?: () => void
  categoryIcon?: string
}


export const AdminProductCardVertical = ({
  product,
  onEdit,
  onDelete,
  categoryIcon
}: AdminProductCardVerticalProps) => {
  const params = useParams()
  const locale = useLocale()
  const price = ((product.basePriceCents || 0) / 100).toFixed(2)

  // Fallback chain: Primary photo -> First photo -> Selected Category Preset Icon -> No image placeholder
  const primaryImage = product.primaryImage?.imageUrl || 
                       product.images?.find(img => img.isPrimary)?.imageUrl || 
                       product.images?.[0]?.imageUrl || 
                       categoryIcon

  const displayName = locale === "km" ? (product.nameKm || product.nameEn) : product.nameEn
  const displayDesc = locale === "km" ? (product.descriptionKm || product.descriptionEn) : product.descriptionEn

  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      className={cn(
        "group relative flex flex-col overflow-hidden shrink-0",
        "rounded-[28px] border border-zinc-150 relative transition-all duration-300 bg-zinc-50",
        "w-full h-[320px] text-left cursor-pointer shadow-sm hover:shadow-lg hover:border-zinc-200"
      )}
    >
      {/* Banner Backdrop Image (Fills the entire background) */}
      <div className="absolute inset-0 w-full h-full overflow-hidden bg-gradient-to-tr from-indigo-50/50 to-rose-50/50">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100/50">
            <ImageIcon size={32} strokeWidth={1.5} className="text-zinc-300" />
          </div>
        )}

        {/* Status Badge (Floats at the top-left) */}
        <div className={cn(
          "absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-white/90 backdrop-blur-sm shadow-sm z-20",
          product.isAvailable
            ? "text-emerald-700 border-emerald-500/20"
            : "text-zinc-500 border-zinc-500/20"
        )}>
          <div className={cn(
            "w-1 h-1 rounded-full",
            product.isAvailable ? "bg-emerald-500" : "bg-zinc-400"
          )} />
          {product.isAvailable ? "Active" : "Inactive"}
        </div>
      </div>

      {/* Floating Glassmorphic Content Card */}
      <div className="absolute bottom-3 left-3 right-3 p-4 bg-white/45 backdrop-blur-md border border-white/40 rounded-[22px] shadow-[0_8px_30px_rgb(0,0,0,0.06)] flex flex-col justify-between min-h-[110px] z-10">
        {/* Row 1: Name & Price */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-zinc-950 text-[14px] leading-snug truncate">
              {displayName}
            </h3>
            {displayDesc ? (
              <p className="text-zinc-500 font-medium text-[11px] leading-relaxed truncate mt-0.5">
                {displayDesc}
              </p>
            ) : (
              <p className="text-zinc-400 font-medium text-[11px] leading-relaxed truncate italic mt-0.5">
                No description
              </p>
            )}
          </div>
          <span className="font-semibold text-[14px] text-zinc-950 flex-shrink-0 bg-zinc-950/5 border border-zinc-950/5 px-2 py-0.5 rounded-lg backdrop-blur-sm">
            ${price}
          </span>
        </div>

        {/* Row 2: Action Controls */}
        <div className="flex items-center gap-2 pt-2.5 border-t border-zinc-950/5 mt-2.5">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            className="flex-1 h-8 flex items-center justify-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-[12px] font-semibold transition-colors shadow-sm"
          >
            <Edit3 size={13} strokeWidth={2} />
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            className="w-8 h-8 flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl transition-colors border border-rose-100/50"
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
