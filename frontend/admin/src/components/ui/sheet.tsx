import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[var(--color-background-raised)]/80 backdrop-blur-md animate-in fade-in duration-300"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>
  );
}

export function SheetContent({ className, children, side = "right" }: { className?: string; children: React.ReactNode; side?: "right" | "left" }) {
  return (
    <div className={cn(
      "relative w-full max-w-[440px] bg-white h-full shadow-[0_40px_100px_rgba(0,0,0,0.1)] border-l border-zinc-150 flex flex-col z-50 animate-in slide-in-from-right duration-300",
      className
    )}>
      {children}
    </div>
  );
}

export function SheetHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("px-8 py-6 border-b border-zinc-100 flex items-center justify-between flex-shrink-0", className)}>
      {children}
    </div>
  );
}

export function SheetTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h2 className={cn("text-[18px] font-normal text-zinc-950 tracking-tight leading-none", className)}>
      {children}
    </h2>
  );
}

export function SheetFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("p-6 border-t border-zinc-100 bg-zinc-50/50 flex gap-3 flex-shrink-0", className)}>
      {children}
    </div>
  );
}

export function SheetDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("text-[13px] text-zinc-400 mt-2 font-normal leading-relaxed", className)}>
      {children}
    </p>
  );
}
