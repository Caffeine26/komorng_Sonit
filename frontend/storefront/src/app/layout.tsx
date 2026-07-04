import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import '@/styles/globals.css';
import { LocaleProvider } from '@/providers/locale-provider';
import { QrSessionProvider } from '@/providers/qr-session-provider';
import { CartProvider } from '@/features/cart';
import { Locale } from '@/config/constants';

export const metadata: Metadata = {
  title: 'Komorng Storefront',
  description: 'Komorng Storefront',
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

export default function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value as Locale | undefined;
  const locale = localeCookie === 'en' ? 'en' : 'km';

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <LocaleProvider initialLocale={locale}>
          <QrSessionProvider>
            <CartProvider>
              {children}
            </CartProvider>
          </QrSessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
