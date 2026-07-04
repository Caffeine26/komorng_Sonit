import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useParams } from 'next/navigation';
import { 
  uploadMenuItemImage, 
  createAdminCategory, 
  updateAdminCategory,
  createAdminMenuItem,
  updateAdminMenuItem,
  deleteAdminCategory,
  deleteAdminMenuItem,
  getAdminMenuItems,
  bulkDeleteAdminMenuItems
} from "@/lib/api/menu";

/**
 * Feature Hook: useMenu
 * Layer 4 abstraction for components. Handles data submission state and auth token forwarding.
 */
export function useMenu() {
  const { token } = useAuth();
  const params = useParams();
  const tenantSlug = (params?.tenantSlug as string) || '';

  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getItems = async (categoryId: string) => {
    if (!token) throw new Error('Not authenticated');
    setIsLoading(true);
    try {
      return await getAdminMenuItems(categoryId, tenantSlug, token);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    if (!token) throw new Error('Not authenticated');
    setIsUploading(true);
    setError(null);
    try {
      const result = await uploadMenuItemImage(file, tenantSlug, token);
      return result.url;
    } catch (err: any) {
      setError(err.message || 'Image upload failed');
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const createCategory = async (data: any) => {
    if (!token) throw new Error('Not authenticated');
    setIsSubmitting(true);
    setError(null);
    try {
      return await createAdminCategory(data, tenantSlug, token);
    } catch (err: any) {
      setError(err.message || 'Failed to create category');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateCategory = async (id: string, data: any) => {
    if (!token) throw new Error('Not authenticated');
    setIsSubmitting(true);
    setError(null);
    try {
      return await updateAdminCategory(id, data, tenantSlug, token);
    } catch (err: any) {
      setError(err.message || 'Failed to update category');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const createMenuItem = async (categoryId: string, data: any) => {
    if (!token) throw new Error('Not authenticated');
    setIsSubmitting(true);
    setError(null);
    try {
      return await createAdminMenuItem(categoryId, data, tenantSlug, token);
    } catch (err: any) {
      setError(err.message || 'Failed to create item');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateMenuItem = async (categoryId: string, id: string, data: any) => {
    if (!token) throw new Error('Not authenticated');
    setIsSubmitting(true);
    setError(null);
    try {
      return await updateAdminMenuItem(categoryId, id, data, tenantSlug, token);
    } catch (err: any) {
      setError(err.message || 'Failed to update item');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!token) throw new Error('Not authenticated');
    setIsSubmitting(true);
    setError(null);
    try {
      return await deleteAdminCategory(id, tenantSlug, token);
    } catch (err: any) {
      setError(err.message || 'Failed to delete category');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteMenuItem = async (categoryId: string, id: string) => {
    if (!token) throw new Error('Not authenticated');
    setIsSubmitting(true);
    setError(null);
    try {
      return await deleteAdminMenuItem(categoryId, id, tenantSlug, token);
    } catch (err: any) {
      setError(err.message || 'Failed to delete item');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const bulkDeleteMenuItems = async (ids: string[]) => {
    if (!token) throw new Error('Not authenticated');
    setIsSubmitting(true);
    setError(null);
    try {
      return await bulkDeleteAdminMenuItems(ids, tenantSlug, token);
    } catch (err: any) {
      setError(err.message || 'Failed to bulk delete items');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isUploading,
    isSubmitting,
    isLoading,
    error,
    getItems,
    uploadImage,
    createCategory,
    updateCategory,
    deleteCategory,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
    bulkDeleteMenuItems
  };
}
