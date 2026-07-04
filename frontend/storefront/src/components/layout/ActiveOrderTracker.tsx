"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChefHat, ChevronRight } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * 🍱 ActiveOrderTracker (Protocol Corrected)
 * Rule: Zero uppercase, No circular progress.
 */
export const ActiveOrderTracker = () => {
  const router = useRouter();
  const base = ``;

  // This would normally come from a real-time hook/socket
  const [activeOrder] = React.useState<{ id: string; status: string; label: string } | null>(null);

  if (!activeOrder) return null;

  return (
    <div className="px-4 py-2 pointer-events-auto">
      <motion.button
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => router.push(`${base}/o`)}
        className="w-full max-w-lg mx-auto bg-white/70 backdrop-blur-2xl border border-white/60 shadow-lg shadow-zinc-200/30 rounded-[24px] p-3 flex items-center gap-4 group"
      >
        {/* Simple Minimalist Icon */}
        <div className="relative shrink-0 w-12 h-12 flex items-center justify-center bg-primary/5 rounded-full border border-primary/10 shadow-inner">
          <ChefHat size={22} className="text-primary" />
        </div>

        {/* Content Section (Sentence Case) */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[12px] font-bold text-primary">Active order</span>
            <span className="text-[12px] font-bold text-zinc-300">#{activeOrder.id}</span>
          </div>
          <p className="text-[14px] font-bold text-zinc-900 leading-tight">
            {activeOrder.label}
          </p>
        </div>

        {/* Right Arrow */}
        <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-300 group-hover:text-zinc-500 transition-colors">
          <ChevronRight size={18} strokeWidth={2.5} />
        </div>
      </motion.button>
    </div>
  );
};
