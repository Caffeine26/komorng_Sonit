'use client';

import type { ReactNode } from 'react';

// Stub: install next-intl and replace with NextIntlClientProvider.
//
//   import { NextIntlClientProvider } from 'next-intl';
//   return (
//     <NextIntlClientProvider locale={locale} messages={messages}>
//       {children}
//     </NextIntlClientProvider>
//   );
export function I18nProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
