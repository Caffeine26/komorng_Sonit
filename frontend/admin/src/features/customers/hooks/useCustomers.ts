import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { ListCustomersOutput } from '@xfos/contracts-bff-admin';

export function useCustomers(tenantSlug: string) {
  const [data, setData] = useState<ListCustomersOutput>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCustomers = useCallback(async () => {
    if (!tenantSlug) return;
    setIsLoading(true);
    try {
      const response = await apiFetch<ListCustomersOutput>('/api/v1/admin/customers', {
        headers: {
          'x-tenant-slug': tenantSlug,
        }
      });
      setData(response);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch customers', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchCustomers,
  };
}
