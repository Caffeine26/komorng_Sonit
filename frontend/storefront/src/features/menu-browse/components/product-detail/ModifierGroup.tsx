import React from "react";
import Image from "next/image";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ModifierOption {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
}

interface ModifierGroupProps {
  title: string;
  isRequired: boolean;
  options: ModifierOption[];
  selectedIds: string[];
  selectionType: "single" | "multiple";
  onSelect: (id: string) => void;
  isAbsolute?: boolean;
}

export const ModifierGroup = ({
  title,
  isRequired,
  options,
  selectedIds,
  selectionType,
  onSelect,
  isAbsolute = false,
}: ModifierGroupProps) => {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-jakarta font-black text-[16px] text-zinc-900">{title}</h3>
          {isRequired ? (
            <span className="px-2 py-[2px] bg-primary text-white text-[10px] font-black rounded-full tracking-wide">Required</span>
          ) : (
            <span className="px-2 py-[2px] bg-zinc-200 text-zinc-500 text-[10px] font-black rounded-full tracking-wide">Optional</span>
          )}
        </div>
        {isRequired && <span className="text-[12px] font-bold text-zinc-400">Select 1</span>}
      </div>
      
      <div className="bg-white rounded-[24px] p-2 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        {options.map((opt, idx) => {
          const isSelected = selectedIds.includes(opt.id);
          return (
            <button 
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              className={cn(
                "w-full flex items-center justify-between p-3 text-left transition-colors rounded-[16px]",
                isSelected ? "bg-primary/5" : "hover:bg-zinc-50",
                idx !== options.length - 1 && !isSelected ? "border-b border-zinc-100/80" : ""
              )}
            >
              <div className="flex items-center gap-3">
                {opt.image && (
                  <div className="w-11 h-11 rounded-full bg-zinc-100 overflow-hidden relative shadow-sm border border-black/5 shrink-0">
                    <Image src={opt.image} alt={opt.name} fill className="object-cover" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-[15px] text-zinc-900 mb-0.5">{opt.name}</div>
                  {opt.description && <div className="text-[13px] font-medium text-zinc-400">{opt.description}</div>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                {opt.price > 0 && (
                  <span className="text-[14px] font-medium text-zinc-700">
                    {isAbsolute ? `$${opt.price.toFixed(2)}` : `+$${opt.price.toFixed(2)}`}
                  </span>
                )}
                {opt.description && opt.price === 0 && (
                  <span className="text-[14px] font-medium text-zinc-400">
                    {isAbsolute ? `$0.00` : `+$0.00`}
                  </span>
                )}
                {isSelected ? (
                  <CheckCircle2 size={24} className="text-primary fill-primary/10" strokeWidth={2.5} />
                ) : (
                  <Circle size={24} className="text-zinc-300" strokeWidth={2} />
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  );
};
