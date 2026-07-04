'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * Client-side translations provider.
 * Must be 'use client' so Next.js uses NextIntlClientProvider's client variant
 * instead of the server variant (NextIntlClientProviderServer) which requires
 * the next-intl plugin in next.config.js.
 */
export function TranslationsProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: AbstractIntlMessages;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
