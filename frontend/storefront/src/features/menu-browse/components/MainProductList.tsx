"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HorizontalProductCard } from "./HorizontalProductCard";
import { VerticalProductCard } from "./VerticalProductCard";
import { cn } from "@/lib/utils/cn";



/**
 * 🍱 MainProductList Component
 * 
 * Features:
 * - High-Fidelity Interaction: Transitions between 1-column Vertical and 1-column Horizontal views.
 * - Instant Switching: Reduced animation duration for zero-latency feel.
 * - Fully Responsive: Premium centering and scaling across devices.
 */
export const MainProductList = ({ 
  products, 
  title = "Today's Selection",
  showSeeAll,
  onSeeAll,
  className,
  viewMode = "list",
  onProductClick
}: any) => {
  const isGrid = viewMode === "grid";

  return (
    <div className={cn("w-full mt-2 pb-2 ease-in-out", className)}>
      <div className="flex items-center justify-between px-4 sm:px-6 mb-4 group/header transition-all">
        <div className="flex items-center gap-4">
          <h2 className="font-jakarta font-extrabold text-[22px] sm:text-[24px] text-black tracking-tight drop-shadow-sm">{title}</h2>
          {showSeeAll && (
            <button 
              onClick={onSeeAll}
              className="text-primary text-[12px] sm:text-[14px] font-extrabold tracking-tight capitalize hover:text-primary-hover hover:scale-105 active:scale-95 transition-all"
            >
              See All
            </button>
          )}
        </div>
      </div>

      <div className="relative px-2 sm:px-4 py-[10px] transition-all overflow-visible">
        <AnimatePresence mode="popLayout" initial={false}>
          {isGrid ? (
            /* ─── HORIZONTAL SCROLL MODE: Uber Eats style row ───────────────────── */
            <motion.div
              key="grid-view"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex flex-row overflow-x-auto snap-x snap-mandatory gap-4 pb-4 px-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} // Hide scrollbar
            >
              {products.map((product: any) => (
                <div key={product.id} className="snap-center">
                  <VerticalProductCard product={product} onClick={() => onProductClick?.(product)} />
                </div>
              ))}
            </motion.div>
          ) : (
            /* ─── LIST MODE: 1-col stack of HORIZONTAL cards ───────────────── */
            <motion.div
              key="list-view"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="grid grid-cols-1 md:grid-cols-2 gap-5" // 1 col mobile → 2 col iPad+
            >
              {products.map((product: any) => (
                <HorizontalProductCard key={product.id} product={product} onClick={() => onProductClick?.(product)} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>





    </div>
  );
};

