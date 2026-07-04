import React from "react";
import { cn } from "@/lib/utils/cn";

interface SettingsCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "glass" | "zinc";
}

export function SettingsCard({ children, className, variant = "glass" }: SettingsCardProps) {
  return (
    <div className={cn(
      "rounded-[40px] p-8 border transition-all",
      variant === "glass" 
        ? "bg-white/50 backdrop-blur-xl border-zinc-100 shadow-xl shadow-zinc-200/20" 
        : "bg-zinc-50/50 border-zinc-100",
      className
    )}>
      {children}
    </div>
  );
}
