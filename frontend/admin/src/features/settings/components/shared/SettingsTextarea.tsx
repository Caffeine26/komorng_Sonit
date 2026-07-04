import React from "react";
import { cn } from "@/lib/utils/cn";
import { useSettingsContext } from "./SettingsContext";

interface SettingsTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

export function SettingsTextarea({ className, disabled, ...props }: SettingsTextareaProps) {
  const { isEditing } = useSettingsContext();
  const isDisabled = disabled || !isEditing;

  return (
    <textarea 
      disabled={isDisabled}
      readOnly={isDisabled}
      {...props}
      className={cn(
        "w-full h-40 bg-white border border-zinc-100 rounded-[32px] text-[14px] font-normal transition-all p-6 shadow-sm resize-none focus:outline-none",
        isDisabled 
          ? "text-zinc-950 cursor-default pointer-events-none" 
          : "text-zinc-950 focus:border-primary focus:ring-4 focus:ring-primary/5",
        className
      )}
    />
  );
}
