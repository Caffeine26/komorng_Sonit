'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useLocale } from 'next-intl';

export function LanguageSwitcher({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const currentLocale = useLocale();

  const handleToggle = () => {
    const nextLocale = currentLocale === 'km' ? 'en' : 'km';
    
    // Set cookie
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000`;

    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={cn(
        "flex items-center gap-3 w-full p-3 rounded-[16px] text-zinc-500 hover:text-zinc-950 hover:bg-zinc-50 transition-all group outline-none",
        isPending && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className="w-10 h-10 rounded-[12px] bg-zinc-50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all border border-transparent group-hover:border-zinc-100 shrink-0 relative overflow-hidden">
        <Globe size={18} strokeWidth={2.5} className="text-zinc-400 group-hover:text-primary transition-colors" />
        
        {/* Active Indicator Dot */}
        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />
      </div>

      {!isCollapsed && (
        <div className="flex-1 text-left flex items-center justify-between min-w-0 pr-1">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium leading-none mb-1">
              {currentLocale === 'km' ? 'ភាសាខ្មែរ' : 'English'}
            </span>
            <span className="text-[11px] text-zinc-400 font-medium">
              Click to change
            </span>
          </div>
          
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">
            <Check size={12} strokeWidth={3} />
          </div>
        </div>
      )}
    </button>
  );
}
