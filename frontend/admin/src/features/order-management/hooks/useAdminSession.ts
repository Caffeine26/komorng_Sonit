import { useCallback, useEffect, useState } from 'react'
import { createAdminSession } from "@/lib/api/order";

export function useAdminSession(
  tenantSlug: string,
  enabled = true
) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isError, setIsError] = useState(false)

  const refresh = useCallback(async () => {
    if (!tenantSlug || !enabled) {
      setSessionId(null)
      setIsReady(false)
      setIsError(false)
      return
    }
    
    setIsReady(false)
    setIsError(false)
    
    try {
      const res = await createAdminSession(tenantSlug)
      setSessionId(res.sessionId)
      setIsReady(true)
      setIsError(false)
    } catch (err) {
      console.error('[useAdminSession] failed:', err)
      setSessionId(null)
      setIsReady(false)
      setIsError(true)
    }
  }, [tenantSlug, enabled])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { sessionId, isReady, isError, refresh }
}
