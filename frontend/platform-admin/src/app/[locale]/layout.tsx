import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { SUPPORTED_LOCALES, type Locale } from '@/config/constants';

// Locale-aware layout. This is the right place to wrap children with i18n,
// theme, and query providers — NOT the root layout.
export default function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  if (!SUPPORTED_LOCALES.includes(params.locale as Locale)) notFound();

  // TODO: wrap with <I18nProvider>, <QueryProvider>, <ThemeProvider> from src/providers
  return <>{children}</>;
}

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}
