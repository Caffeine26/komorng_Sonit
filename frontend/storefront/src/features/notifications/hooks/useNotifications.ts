import { useState, useEffect, useCallback } from 'react';
import { getNotifications, markNotificationRead } from '@/lib/api/notifications';
import { TenantNotificationDto } from '@xfos/contracts-bff-storefront';

export function useNotifications(tenantSlug: string, isLoggedIn: boolean) {
  const [notifications, setNotifications] = useState<TenantNotificationDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState<Error | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!isLoggedIn || !tenantSlug) return;
    setIsLoading(true);
    setIsError(null);
    try {
      const data = await getNotifications(tenantSlug);
      setNotifications(data.notifications);
    } catch (e: any) {
      setIsError(e);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, isLoggedIn]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    try {
      await markNotificationRead(tenantSlug, id);
    } catch (e) {
      // Revert on error
      fetchNotifications();
    }
  };

  return {
    notifications,
    isLoading,
    isError,
    markAsRead,
  };
}
