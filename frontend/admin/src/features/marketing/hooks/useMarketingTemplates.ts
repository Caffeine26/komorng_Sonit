import { useState, useEffect, useCallback } from 'react';
import { getMarketingTemplates } from '@/lib/api/marketing';
import { NotificationTemplateDto } from '@xfos/contracts-bff-admin';

export const useMarketingTemplates = (tenantSlug: string) => {
  const [data, setData] = useState<NotificationTemplateDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!tenantSlug) return;
    setIsLoading(true);
    try {
      const response = await getMarketingTemplates(tenantSlug);
      setData(response);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch templates', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates: data,
    isLoading,
    isError: error,
    refetch: fetchTemplates,
  };
};
