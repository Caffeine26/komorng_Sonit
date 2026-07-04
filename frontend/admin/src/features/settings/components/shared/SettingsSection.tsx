import React from "react";
import { cn } from "@/lib/utils/cn";

interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({ 
  title, 
  description, 
  icon: Icon, 
  children, 
  className 
}: SettingsSectionProps) {
  return (
    <section className={cn("space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500", className)}>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className="w-11 h-11 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-950 shadow-sm border border-zinc-100">
            <Icon size={20} strokeWidth={1.5} />
          </div>
        )}
        <div>
          <h2 className="text-[20px] font-normal text-zinc-950 tracking-tight">{title}</h2>
          {description && <p className="text-[12px] font-normal text-zinc-400 mt-1">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
