import React from "react";
import { useTranslation } from "@/lib/i18n";

interface SpecialInstructionsProps {
  value: string;
  onChange: (value: string) => void;
}

export const SpecialInstructions = ({ value, onChange }: SpecialInstructionsProps) => {
  const { t } = useTranslation();
  return (
    <div className="mb-6">
      <h3 className="font-jakarta font-black text-[16px] text-zinc-900 mb-1">{t("product.specialInstructions")}</h3>
      <p className="text-[13px] font-medium text-zinc-400 mb-3">{t("product.specialRequest")}</p>
      <textarea 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("product.addNotePlaceholder")}
        className="w-full bg-zinc-200/50 rounded-[24px] p-5 text-[15px] text-zinc-800 placeholder:text-zinc-400 outline-none border-2 border-transparent focus:border-primary/20 transition-all resize-none h-28 font-medium"
      />

      {/* Quick Suggestions */}
      <div className="flex flex-wrap gap-2 mt-4">
        {[t("product.moreSpicy"), t("product.lessSweet"), t("product.noOnions"), t("product.extraNapkins"), t("product.wellDone")].map((tag) => (
          <button
            key={tag}
            onClick={() => {
              const newValue = value.trim() === "" ? tag : `${value}, ${tag}`;
              onChange(newValue);
            }}
            className="px-4 py-2 bg-white rounded-full border border-zinc-200 text-[12px] font-bold text-zinc-600 hover:bg-zinc-50 active:scale-95 transition-all shadow-sm"
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
};
