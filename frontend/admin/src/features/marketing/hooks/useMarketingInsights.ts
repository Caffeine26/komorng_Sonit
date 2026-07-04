import useSWR from 'swr';
import { apiFetch } from '@/lib/api/client';
import { MarketingInsightsResponseDto } from '@xfos/contracts-bff-admin';
import { useState, useEffect, useCallback } from 'react';

export const useMarketingInsights = (tenantSlug: string) => {
  const [data, setData] = useState<MarketingInsightsResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!tenantSlug) return;
    setIsLoading(true);
    try {
      const response = await apiFetch<MarketingInsightsResponseDto>(`/api/v1/admin/${tenantSlug}/marketing/insights`, {
        headers: {
          'x-tenant-slug': tenantSlug,
        }
      });
      setData(response);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch marketing insights', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  return {
    data,
    isLoading,
    isError: error,
    refetch: fetchInsights,
  };
};
