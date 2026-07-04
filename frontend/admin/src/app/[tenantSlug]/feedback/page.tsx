"use client";

import React from "react";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

export default function FeedbackPage() {
  const t = useTranslations("feedback");
  return (
    <div className="min-h-screen bg-zinc-50/10 flex flex-col animate-ui-entry">
      <header className="py-6 sm:py-8 px-4 md:px-8 lg:px-10 flex flex-col lg:flex-row lg:items-center gap-6 justify-between flex-shrink-0 relative z-50 bg-zinc-50/10 border-b border-zinc-100/50">
        <div className="flex flex-col">
          <h1 className="text-[24px] sm:text-[30px] font-medium text-zinc-950 tracking-tight leading-none">{t('title')}</h1>
          <p className="text-[13px] sm:text-[15px] font-normal text-zinc-400 mt-2">{t('subtitle')}</p>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 lg:p-10 pb-24 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center animate-ui-entry">
          <div className="w-20 h-20 bg-zinc-50 rounded-[32px] flex items-center justify-center text-zinc-300 mb-6 shadow-sm border border-zinc-100/50">
            <MessageSquare size={32} />
          </div>
          <h3 className="text-[18px] font-normal text-zinc-950 tracking-tight">{t('coming_soon')}</h3>
          <p className="text-[14px] font-normal text-zinc-400 mt-2 max-w-xs">{t('coming_soon_desc')}</p>
        </div>
      </main>
    </div>
  );
}
