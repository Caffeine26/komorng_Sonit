"use client";

import React from "react";
import { motion } from "framer-motion";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ViewMode = "grid" | "list";

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

/**
 * 🎨 ViewToggle Component
 * 
 * Features:
 * - Pill-shaped slider tray.
 * - Floating white circle active-indicator.
 * - Elastic spring transitions.
 */
export const ViewToggle: React.FC<ViewToggleProps> = ({ 
  mode, 
  onChange, 
  className 
}) => {
  return (
    <div 
      className={cn(
        "relative flex items-center h-12 w-24 p-1 rounded-full select-none cursor-pointer",
        "bg-zinc-900/10 backdrop-blur-xl border border-zinc-950/5 shadow-inner",
        className
      )}
      onClick={() => onChange(mode === "grid" ? "list" : "grid")}
    >
      {/* ─── Active Indicator (The Liquid Glass Circle) ─────────────────── */}
      <motion.div
        className="absolute top-1 left-1 w-10 h-10 bg-white rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.08)] z-0"
        initial={false}
        animate={{
          x: mode === "list" ? 0 : 48, // 96 total - 4 padding*2 - 40 width = 48 distance
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 30
        }}
      />

      {/* ─── Icons ──────────────────────────────────────────────────── */}
      <div className={cn(
        "relative z-10 w-10 h-10 flex items-center justify-center transition-colors duration-300",
        mode === "list" ? "text-primary scale-110" : "text-zinc-500 hover:text-zinc-700"
      )}>
        <List className="w-5 h-5" strokeWidth={2.5} />
      </div>

      <div className={cn(
        "relative z-10 w-10 h-10 flex items-center justify-center ml-auto transition-colors duration-300",
        mode === "grid" ? "text-primary scale-110" : "text-zinc-500 hover:text-zinc-700"
      )}>
        <LayoutGrid className="w-5 h-5" strokeWidth={2.5} />
      </div>
    </div>

  );
};
