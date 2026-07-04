import { Inter, Kantumruy_Pro } from 'next/font/google';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import '@/styles/globals.css';
import { cn } from '@/lib/utils/cn';
import { TranslationsProvider } from '@/components/providers/TranslationsProvider';
import { AuthProvider } from '@/providers/auth-provider';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from '@/config/constants';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const kantumruyPro = Kantumruy_Pro({
  subsets: ['khmer'],
  variable: '--font-kantumruy',
  weight: ['100', '200', '300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Komorng Admin',
  description: 'Komorng Admin Portal',
  icons: {
    icon: [
      { url: '/shared/images/logo.png' },
      { url: '/shared/images/logo.png', sizes: '32x32', type: 'image/png' },
      { url: '/shared/images/logo.png', sizes: '192x192', type: 'image/png' },
      { url: '/shared/images/logo.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/shared/images/logo.png' },
      { url: '/shared/images/logo.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const localeHeader = headers().get('x-next-intl-locale') || DEFAULT_LOCALE;
  const validLocale = SUPPORTED_LOCALES.includes(localeHeader as Locale) ? localeHeader : DEFAULT_LOCALE;

  let messages;
  try {
    messages = (await import(`../lib/i18n/dictionaries/${validLocale}.json`)).default;
  } catch {
    messages = {};
  }

  return (
    <html lang={validLocale} className="scroll-smooth">
      <body className={cn(
        "min-h-screen bg-white text-zinc-950 antialiased",
        inter.variable,
        kantumruyPro.variable
      )}>
        <AuthProvider>
          <TranslationsProvider locale={validLocale} messages={messages}>
            {children}
          </TranslationsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
