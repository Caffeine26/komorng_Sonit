import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useParams } from 'next/navigation';
import { 
  getAdminTables,
  createAdminTable,
  updateAdminTable,
  deleteAdminTable,
  trackAdminTablePrint,
  uploadAdminTableImage,
  type TableItem
} from "@/lib/api/table";

/**
 * Feature Hook: useTables
 * Layer 4 abstraction for components. Handles data submission state and auth token forwarding.
 */
export function useTables() {
  const { token } = useAuth();
  const params = useParams();
  const tenantSlug = (params?.tenantSlug as string) || '';

  const [items, setItems] = useState<TableItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadImage = async (file: File): Promise<string> => {
    if (!token) throw new Error('Not authenticated');
    setIsUploading(true);
    setError(null);
    try {
      const result = await uploadAdminTableImage(file, tenantSlug, token);
      return result.url;
    } catch (err: any) {
      setError(err.message || 'Image upload failed');
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const fetchTables = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminTables(tenantSlug, token);
      setItems(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tables');
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, token]);

  const createTable = async (data: any) => {
    if (!token) throw new Error('Not authenticated');
    setIsSubmitting(true);
    setError(null);
    try {
      const newTable = await createAdminTable(data, tenantSlug, token);
      setItems(prev => [...prev, newTable]);
      return newTable;
    } catch (err: any) {
      setError(err.message || 'Failed to create table');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateTable = async (id: string, data: any) => {
    if (!token) throw new Error('Not authenticated');
    setIsSubmitting(true);
    setError(null);
    try {
      const updatedTable = await updateAdminTable(id, data, tenantSlug, token);
      setItems(prev => prev.map(t => t.id === id ? updatedTable : t));
      return updatedTable;
    } catch (err: any) {
      setError(err.message || 'Failed to update table');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteTable = async (id: string) => {
    if (!token) throw new Error('Not authenticated');
    setIsSubmitting(true);
    setError(null);
    try {
      await deleteAdminTable(id, tenantSlug, token);
      setItems(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete table');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const trackPrint = async (id: string) => {
    if (!token) throw new Error('Not authenticated');
    try {
      await trackAdminTablePrint(id, tenantSlug, token);
    } catch (err: any) {
      console.error('Failed to track table print:', err);
    }
  };

  return {
    items,
    isLoading,
    isSubmitting,
    isUploading,
    error,
    fetchTables,
    uploadImage,
    createTable,
    updateTable,
    deleteTable,
    trackPrint
  };
}
