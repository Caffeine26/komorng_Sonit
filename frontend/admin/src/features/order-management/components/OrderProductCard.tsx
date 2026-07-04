"use client"
import { useLocale } from "next-intl";

import React from "react"
import { motion } from "framer-motion"
import { Plus, ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { useParams } from "next/navigation"

interface OrderProductCardProps {
  product: any // We'll pass the AdminMenuItem from the overview
  onClick: () => void
}


export const OrderProductCard = ({
  product,
  onClick
}: OrderProductCardProps) => {
  const params = useParams()
  const locale = useLocale()
  const price = ((product.basePriceCents || 0) / 100).toFixed(2)

  const primaryImage = product.primaryImage?.imageUrl || 
                       product.images?.find((img: any) => img.isPrimary)?.imageUrl || 
                       product.images?.[0]?.imageUrl

  const displayName = locale === "km" && product.nameKm ? product.nameKm : product.nameEn
  const displayDesc = locale === "km" && product.descriptionKm ? product.descriptionKm : product.descriptionEn

  return (
    <div
      onClick={() => product.isAvailable && onClick()}
      className={cn(
        "group relative flex flex-col overflow-hidden shrink-0",
        "rounded-[28px] border border-zinc-150 relative transition-all duration-300 bg-zinc-50",
        "w-full h-[280px] text-left shadow-sm hover:shadow-lg hover:border-zinc-200 cursor-pointer",
      )}
    >
      {/* Banner Backdrop Image */}
      <div className="absolute inset-0 w-full h-full overflow-hidden bg-gradient-to-tr from-indigo-50/50 to-rose-50/50">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={displayName}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100/50">
            <ImageIcon size={32} strokeWidth={1.5} className="text-zinc-300" />
          </div>
        )}

        {/* Status Badge */}
        {!product.isAvailable && (
          <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-white/90 backdrop-blur-sm shadow-sm z-20 text-rose-600 border-rose-500/20">
            Out of stock
          </div>
        )}
      </div>

      {/* Floating Content Card */}
      <div className="absolute bottom-3 left-3 right-3 p-3.5 bg-white/95 backdrop-blur-xl border border-white/80 rounded-[20px] shadow-[0_4px_12px_rgb(0,0,0,0.05)] flex flex-col gap-2 z-10">
        {/* Name & Description */}
        <div className="flex flex-col min-w-0">
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

        {/* Bottom Row: Price & Add Button */}
        <div className="flex items-center justify-between mt-0.5">
          <span className="font-semibold text-[14px] text-zinc-950 bg-zinc-950/5 border border-zinc-950/5 px-2 py-0.5 rounded-lg backdrop-blur-sm">
            ${price}
          </span>
          
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (product.isAvailable) onClick()
            }}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-full transition-colors active:scale-95",
              product.isAvailable
                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
            )}
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
