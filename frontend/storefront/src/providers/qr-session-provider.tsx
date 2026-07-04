'use client';

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveQrSession } from '@/lib/api/storefront';

export interface QrSessionContextType {
  qrToken: string | null;
  tenantId: string | null;
  sessionId: string | null;
  tableId: string | null;
  tableRef: string | null;
  qrContextId: string | null;
  isLoading: boolean;
}

const QrSessionContext = createContext<QrSessionContextType | undefined>(undefined);

export function QrSessionProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [qrToken, setQrToken] = useState<string | null>(null);
  
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [tableRef, setTableRef] = useState<string | null>(null);
  const [qrContextId, setQrContextId] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Check URL first, fallback to sessionStorage
    const urlQr = searchParams?.get('qr');
    const storedQr = sessionStorage.getItem('xfos_qr_token');
    const activeQr = urlQr || storedQr;

    if (urlQr && urlQr !== storedQr) {
      sessionStorage.setItem('xfos_qr_token', urlQr);
    }

    if (!activeQr) {
      setIsLoading(false);
      return;
    }

    setQrToken(activeQr);

    // 2. Resolve the QR token
    resolveQrSession(activeQr)
      .then((res) => {
        setTenantId(res.tenantId);
        setSessionId(res.sessionId);
        setTableId(res.tableId);
        setTableRef(res.tableRef);
        setQrContextId(res.qrContextId);
        
        // Persist the resolved data just in case
        sessionStorage.setItem('xfos_qr_session', JSON.stringify(res));
      })
      .catch((err) => {
        console.error('Failed to resolve QR session in provider:', err);
        // If resolution fails (e.g. expired), maybe we should clear it?
        // Let's keep it simple for now.
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [searchParams]);

  return (
    <QrSessionContext.Provider
      value={{
        qrToken,
        tenantId,
        sessionId,
        tableId,
        tableRef,
        qrContextId,
        isLoading,
      }}
    >
      {children}
    </QrSessionContext.Provider>
  );
}

export function useQrSessionContext() {
  const context = useContext(QrSessionContext);
  if (context === undefined) {
    throw new Error('useQrSessionContext must be used within a QrSessionProvider');
  }
  return context;
}
