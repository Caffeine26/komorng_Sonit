import React from "react";
import { cn } from "@/lib/utils/cn";

export function SettingsListBlock({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={cn(
      "max-w-[1000px] space-y-2",
      className
    )}>
      {children}
    </div>
  );
}

export function SettingsListRow({ children, className, cols = 1 }: { children: React.ReactNode, className?: string, cols?: 1 | 2 }) {
  return (
    <div className={cn(
      "py-2 sm:py-3",
      cols === 2 ? "grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4" : "space-y-4",
      className
    )}>
      {children}
    </div>
  );
}
