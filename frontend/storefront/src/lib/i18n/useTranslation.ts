"use client";

import { useLocale } from "@/providers/locale-provider";
import en from "./dictionaries/en.json";
import km from "./dictionaries/km.json";

export type Locale = "en" | "km";

const dictionaries: Record<Locale, Record<string, string>> = {
  en,
  km,
};

/**
 * Returns a `t()` function that resolves translation keys to the active locale.
 * Usage: const { t } = useTranslation();
 *        t("cart.title") → "កន្ត្រករបស់អ្នក" (if km) or "Your cart" (if en)
 */
export function useTranslation() {
  const { locale } = useLocale();

  const t = (key: string, fallback?: string): string => {
    const currentLang = (locale as Locale) || "en";
    const dictionary = dictionaries[currentLang] || dictionaries.en;
    return dictionary[key] ?? dictionaries.en[key] ?? fallback ?? key;
  };

  return { t, locale };
}
