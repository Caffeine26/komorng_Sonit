"use client";

import React from "react";
import { X, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type DialogVariant = "DEFAULT" | "DESTRUCTIVE" | "SUCCESS" | "INFO" | "WARNING";

interface GlobalActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export const GlobalActionDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm action",
  cancelLabel = "Cancel",
  variant = "DEFAULT",
  isLoading = false,
  children
}: GlobalActionDialogProps) => {
  if (!isOpen) return null;

  const variantStyles = {
    DEFAULT: {
      icon: CheckCircle2,
      bg: "bg-emerald-50",
      text: "text-emerald-500",
      border: "border-emerald-100/50",
      button: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
    },
    DESTRUCTIVE: {
      icon: AlertTriangle,
      bg: "bg-rose-50",
      text: "text-rose-500",
      border: "border-rose-100/50",
      button: "bg-rose-500 text-white hover:bg-rose-600"
    },
    SUCCESS: {
      icon: CheckCircle2,
      bg: "bg-emerald-50",
      text: "text-emerald-500",
      border: "border-emerald-100/50",
      button: "bg-emerald-500 text-white hover:bg-emerald-600"
    },
    INFO: {
      icon: Info,
      bg: "bg-blue-50",
      text: "text-blue-500",
      border: "border-blue-100/50",
      button: "bg-blue-500 text-white hover:bg-blue-600"
    },
    WARNING: {
      icon: AlertCircle,
      bg: "bg-amber-50",
      text: "text-amber-500",
      border: "border-amber-100/50",
      button: "bg-amber-500 text-white hover:bg-amber-600"
    }
  };

  const currentVariant = variantStyles[variant] || variantStyles["DEFAULT"];
  const Icon = currentVariant.icon;


  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
      {/* Backdrop: Unified frosted finish */}
      <div 
        className="absolute inset-0 bg-[var(--color-background-raised)]/80 backdrop-blur-md" 
        onClick={onClose} 
      />
      
      {/* Dialog Container: Compact & High-Precision */}
      <div className="relative w-full max-w-[480px] bg-white rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.1)] border border-white overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        
        {/* Header/Icon Area */}
        <div className="p-8 pb-0 flex flex-col items-center text-center">
          <div className={cn(
            "w-16 h-16 rounded-[24px] flex items-center justify-center mb-6 border transition-all duration-500",
            currentVariant.bg,
            currentVariant.text,
            currentVariant.border
          )}>
            <Icon size={32} strokeWidth={1.5} />
          </div>
          
          <h2 className="text-[20px] font-normal text-zinc-950 tracking-tight leading-tight px-4">
            {title}
          </h2>
          {description && (
            <p className="text-[14px] font-normal text-zinc-400 mt-3 leading-relaxed px-6">
              {description}
            </p>
          )}
        </div>

        {/* Optional Custom Content */}
        {children && (
          <div className="px-8 mt-6">
            {children}
          </div>
        )}

        {/* Actions Area */}
        <div className="p-8 pt-10 flex items-center gap-3">
          {cancelLabel && (
            <button 
              disabled={isLoading}
              onClick={onClose}
              className="flex-1 h-12 bg-zinc-50 text-zinc-950 rounded-xl text-[14px] font-normal hover:bg-zinc-100 transition-all cursor-pointer disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button 
            disabled={isLoading}
            onClick={onConfirm}
            className={cn(
              "flex-1 h-12 rounded-xl text-[14px] font-normal active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2",
              currentVariant.button
            )}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
