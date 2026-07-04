"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Locale = "en" | "km";

interface LocaleContextProps {
  locale: Locale;
  setLocale: (newLocale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextProps | undefined>(undefined);

export const LocaleProvider: React.FC<{ initialLocale: Locale; children: React.ReactNode }> = ({
  initialLocale,
  children,
}) => {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();

  // On mount, sync with localStorage if cookie was missing or different on client side
  useEffect(() => {
    const stored = localStorage.getItem("NEXT_LOCALE") as Locale;
    if (stored && stored !== locale) {
      setLocaleState(stored);
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    if (newLocale === locale) return;

    setLocaleState(newLocale);
    
    // Save to localStorage
    localStorage.setItem("NEXT_LOCALE", newLocale);

    // Save to cookie for SSR
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;

    // Refresh Next.js server components so they get the new locale from cookies
    router.refresh();
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
};

export const useLocale = () => {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
};
