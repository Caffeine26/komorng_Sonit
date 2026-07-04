"use client";

import React from "react";
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight,
  Store,
  Settings,
  UtensilsCrossed,
  Languages,
  QrCode,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const STEPS = [
  { id: 1, name: "Business Profile", desc: "Set your name, logo and contact info", icon: Store, completed: true },
  { id: 2, name: "Service Model", desc: "Select Dine-in, Kiosk or Open Tab", icon: Settings, completed: true },
  { id: 3, name: "Menu Creation", desc: "Add your first categories and items", icon: UtensilsCrossed, completed: true },
  { id: 4, name: "Translations", desc: "Add Khmer translations for your menu", icon: Languages, completed: false },
  { id: 5, name: "QR Codes", desc: "Generate and download table QRs", icon: QrCode, completed: false },
  { id: 6, name: "Go Live", desc: "Activate your store for customers", icon: Zap, completed: false },
];

export const SetupChecklist = () => {
  const completedCount = STEPS.filter(s => s.completed).length;
  const progress = (completedCount / STEPS.length) * 100;

  return (
    <div className="bg-white border border-zinc-100 rounded-[40px] p-10 overflow-hidden relative">
      {/* Progress Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h3 className="text-[20px] font-black text-zinc-900 tracking-tight">Setup Checklist</h3>
          <p className="text-[13px] font-bold text-zinc-400 mt-1">Complete these steps to launch your store</p>
        </div>
        <div className="text-right">
          <p className="text-[24px] font-black text-primary leading-none">{completedCount}/{STEPS.length}</p>
          <p className="text-[11px] font-black text-zinc-300tracking-widest mt-1">Completed</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-zinc-50 rounded-full mb-10 relative overflow-hidden">
        <div 
          className="absolute left-0 top-0 bottom-0 bg-primary transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {STEPS.map((step) => (
          <div 
            key={step.id}
            className={cn(
              "p-5 rounded-3xl border transition-all duration-300 flex flex-col gap-4 group",
              step.completed 
                ? "bg-emerald-50/30 border-emerald-100/50" 
                : "bg-white border-zinc-100 hover:border-zinc-200"
            )}
          >
            <div className="flex items-center justify-between">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                step.completed ? "bg-emerald-500 text-white" : "bg-zinc-50 text-zinc-400 group-hover:bg-zinc-100"
              )}>
                <step.icon size={20} strokeWidth={2} />
              </div>
              {step.completed ? (
                <CheckCircle2 size={18} className="text-emerald-500" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-zinc-100" />
              )}
            </div>
            
            <div>
              <p className={cn(
                "text-[14px] font-black",
                step.completed ? "text-emerald-900" : "text-zinc-900"
              )}>
                {step.id}. {step.name}
              </p>
              <p className="text-[11px] font-bold text-zinc-400 mt-1 leading-tight">{step.desc}</p>
            </div>

            {!step.completed && (
              <button className="mt-2 flex items-center gap-1 text-[11px] font-black text-primary hover:gap-2 transition-all">
                Complete Now <ArrowRight size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
