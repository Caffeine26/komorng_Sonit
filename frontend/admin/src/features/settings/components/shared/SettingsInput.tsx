import React from "react";
import { cn } from "@/lib/utils/cn";
import { useSettingsContext } from "./SettingsContext";

interface SettingsInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  prefix?: string | React.ReactNode;
  className?: string;
}

export function SettingsInput({ prefix, className, disabled, ...props }: SettingsInputProps) {
  const { isEditing } = useSettingsContext();
  const isDisabled = disabled || !isEditing;

  if (prefix) {
    return (
      <div className={cn("flex items-center w-full h-14 bg-white border border-zinc-100 rounded-2xl px-6 shadow-sm transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5",
        isDisabled && "opacity-70",
        className)}>
        <div className={cn("flex items-center justify-center shrink-0", typeof prefix === "string" ? "text-zinc-500 text-[14px]" : "")}>
          {prefix}
        </div>
        <input
          disabled={isDisabled}
          readOnly={isDisabled}
          {...props}
          className="flex-1 w-full bg-transparent text-[14px] font-normal text-zinc-950 focus:outline-none ml-1"
        />
      </div>
    );
  }

  return (
    <input
      disabled={isDisabled}
      readOnly={isDisabled}
      {...props}
      className={cn(
        "w-full h-14 bg-white border border-zinc-100 rounded-2xl text-[14px] font-normal transition-all px-6 shadow-sm focus:outline-none",
        isDisabled
          ? "text-zinc-500 cursor-default"
          : "text-zinc-950 focus:border-primary focus:ring-4 focus:ring-primary/5",
        className
      )}
    />
  );
}
