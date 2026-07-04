'use client';

import type { ReactNode } from 'react';

// Stub: install @tanstack/react-query and replace with a real QueryClientProvider.
//
//   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
//   const client = new QueryClient();
//   return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
export function QueryProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
