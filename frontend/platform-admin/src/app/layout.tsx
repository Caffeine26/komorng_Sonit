import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'XFOS Platform Admin',
  description: 'XFOS Platform Admin',
};

// Root layout is intentionally minimal. Locale-specific providers live at
// app/[locale]/layout.tsx so error/loading pages don't pull in unrelated context.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
