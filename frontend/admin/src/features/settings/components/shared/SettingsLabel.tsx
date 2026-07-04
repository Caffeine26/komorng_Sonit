import React from "react";
import { cn } from "@/lib/utils/cn";

interface SettingsLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
  hint?: string;
}

export function SettingsLabel({ children, hint, className, ...props }: SettingsLabelProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between ml-6 pr-6">
        <label 
          {...props} 
          className={cn("text-[13px] font-normal text-zinc-400", className)}
        >
          {children}
        </label>
        {hint && <span className="text-[10px] font-normal text-zinc-400/70">{hint}</span>}
      </div>
    </div>
  );
}
