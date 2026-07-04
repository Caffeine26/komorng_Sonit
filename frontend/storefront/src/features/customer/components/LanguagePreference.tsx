"use client";

import React from "react";
import { Globe } from "lucide-react";
import { motion, Variants } from "framer-motion";
import { useLocale } from "@/providers/locale-provider";
import { useTranslation } from "@/lib/i18n";

interface LanguagePreferenceProps {
  itemVariants?: Variants;
}

export function LanguagePreference({ itemVariants }: LanguagePreferenceProps) {
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();

  const handleToggleLanguage = (newLocale: "en" | "km") => {
    setLocale(newLocale);
  };

  const content = (
    <div className="bg-white/60 backdrop-blur-[32px] border border-white shadow-[0_14px_30px_rgba(0,0,0,0.03)] rounded-[32px] p-2 overflow-hidden w-full max-w-[320px]">
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-jakarta font-black text-[16px] text-zinc-900 tracking-tight">
          Preferences
        </h3>
      </div>
      <div className="flex flex-col">
        <div className="w-full flex items-center justify-between p-4 min-h-[44px]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-zinc-100/80 flex items-center justify-center text-zinc-500">
              <Globe size={18} strokeWidth={2} />
            </div>
            <span className="font-medium text-[15px] text-zinc-700">{t("preferences.language")}</span>
          </div>
          
          <div className="flex items-center bg-zinc-100/80 rounded-full p-1 border border-zinc-200/50">
            <button
              onClick={() => handleToggleLanguage("en")}
              className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-all ${
                locale === "en" 
                  ? "bg-white text-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.06)]" 
                  : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              en
            </button>
            <button
              onClick={() => handleToggleLanguage("km")}
              className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-all ${
                locale === "km" 
                  ? "bg-white text-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.06)]" 
                  : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              ខ្មែរ
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (itemVariants) {
    return <motion.div variants={itemVariants}>{content}</motion.div>;
  }

  return content;
}

