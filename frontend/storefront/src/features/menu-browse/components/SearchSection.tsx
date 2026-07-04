"use client";

import React from "react";
import { Search, Hash } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface SearchSectionProps {
  className?: string;
}

/**
 * 🍱 SearchSection Component
 * 
 * Features:
 * - Dual Search/Code Inputs: Sleek, high-depth inputs.
 * - Interactive: Subtle focus shadows and Magenta primary focus.
 */
export const SearchSection: React.FC<SearchSectionProps> = ({ className }) => {
  return (
    <div className={cn("flex flex-col gap-4 px-6 mt-6", className)}>
      <div className="flex gap-2">
        {/* Main Search Input */}
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Crave something?"
            className="w-full h-12 pl-10 pr-4 rounded-[16px] bg-zinc-100/80 border border-transparent focus:bg-white focus:border-primary focus:ui-shadow-md transition-all outline-none"
          />
        </div>

        {/* Enter Code Input */}
        <div className="relative w-[120px] group">
          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Code"
            className="w-full h-12 pl-10 pr-4 rounded-[16px] bg-zinc-100/80 border border-transparent focus:bg-white focus:border-primary focus:ui-shadow-md transition-all outline-none"
          />
        </div>
      </div>
    </div>
  );
};
