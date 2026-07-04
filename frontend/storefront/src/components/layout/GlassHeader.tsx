"use client";

import React from "react";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

interface GlassHeaderProps {
  title: string;
  onBack?: () => void;
  className?: string;
}

/**
 * 🧊 GlassHeader Component
 * A premium, frosted-glass header designed for secondary pages (Favorites, Cart, Summary).
 * Mirrors the "Liquid Glass" design of the CustomerHeader and CartFooter.
 */
export const GlassHeader: React.FC<GlassHeaderProps> = ({ title, onBack, className }) => {
  const router = useRouter();

  return (
    <nav
      className={cn(
        "sticky top-4 z-[100] mx-4 mb-4 rounded-[28px] sm:rounded-[32px] h-[64px] flex items-center justify-between px-4 transition-all duration-300",
        className
      )}
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.65)",
        backdropFilter: "blur(32px) saturate(180%)",
        WebkitBackdropFilter: "blur(32px) saturate(180%)",
        boxShadow: "0 14px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0,0,0,0.05)",
        border: "1px solid rgba(255, 255, 255, 0.4)"
      }}
    >
      {/* ── Back Button ── */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onBack || (() => router.back())}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 border border-white shadow-sm text-zinc-900 active:scale-90 transition-transform"
      >
        <ChevronLeft size={24} strokeWidth={2.5} />
      </motion.button>

      {/* ── Dynamic Title ── */}
      <h1 className="text-[17px] font-black text-primary font-poppins tracking-tight">
        {title}
      </h1>

      {/* ── Spacer for alignment ── */}
      <div className="w-10" />
    </nav>
  );
};
