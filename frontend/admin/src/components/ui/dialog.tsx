import React from "react";
import { cn } from "@/lib/utils/cn";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[var(--color-background-raised)]/80 backdrop-blur-md animate-in fade-in duration-300"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>
  );
}

export function DialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn(
      "relative w-full max-w-[480px] bg-white rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.1)] border border-white overflow-hidden flex flex-col z-50 animate-in zoom-in-95 duration-300",
      className
    )}>
      {children}
    </div>
  );
}

export function DialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("p-8 pb-0 flex flex-col items-center text-center", className)}>
      {children}
    </div>
  );
}

export function DialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h2 className={cn("text-[20px] font-normal text-zinc-950 tracking-tight leading-tight px-4", className)}>
      {children}
    </h2>
  );
}

export function DialogDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("text-[14px] font-normal text-zinc-400 mt-3 leading-relaxed px-6", className)}>
      {children}
    </p>
  );
}

export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("p-8 pt-10 flex items-center gap-3 border-t border-zinc-50 mt-6", className)}>
      {children}
    </div>
  );
}
