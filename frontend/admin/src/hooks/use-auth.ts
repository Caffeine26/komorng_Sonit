import { useSession } from 'next-auth/react'

/**
 * Global useAuth hook (Layer 4)
 * Provides session state, token, and tenant resolution to the rest of the application.
 * This hook is read-only — it never writes tokens anywhere.
 */
export function useAuth() {
  const { data: session, status } = useSession()
console.log('[useAuth] session status:', status, 'token:', (session as any)?.token ?? 'NULL')

  return {
    isReady:  status !== 'loading',
    // The (session as any) cast is acceptable here only because NextAuth session typing requires it
    token:    (session as any)?.token    ?? null,
    tenantId: (session as any)?.tenantId ?? null,
    role:     (session as any)?.user?.role ?? null,
    user:     session?.user ?? null,
    isStaff:  ['MERCHANT', 'ADMIN'].includes((session as any)?.user?.role ?? ''),
  }
}
