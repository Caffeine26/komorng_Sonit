import React from "react";
import { cn } from "@/lib/utils/cn";
import { useSettingsContext } from "./SettingsContext";

interface SettingsSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
  className?: string;
}

export function SettingsSelect({ children, className, disabled, ...props }: SettingsSelectProps) {
  const { isEditing } = useSettingsContext();
  const isDisabled = disabled || !isEditing;

  return (
    <select 
      disabled={isDisabled}
      {...props}
      className={cn(
        "w-full h-14 bg-white border border-zinc-100 rounded-2xl text-[14px] font-normal transition-all px-6 shadow-sm appearance-none focus:outline-none",
        isDisabled 
          ? "text-zinc-950 cursor-default pointer-events-none" 
          : "text-zinc-950 focus:border-primary focus:ring-4 focus:ring-primary/5 cursor-pointer",
        className
      )}
    >
      {children}
    </select>
  );
}
