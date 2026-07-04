import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useCart } from "@/features/cart";
import type { StorefrontOrderStatusItem, StorefrontOrderHistoryItem } from "@xfos/contracts-bff-storefront";
import { useQrSessionContext } from "@/providers/qr-session-provider";

export function useOrderAgain() {
  const router = useRouter();
  const params = useParams();
  const { qrToken } = useQrSessionContext();
  const { addItem } = useCart();
  const [isReordering, setIsReordering] = useState(false);
  const query = qrToken ? `?qr=${qrToken}` : '';

  const handleOrderAgain = async (items: StorefrontOrderStatusItem[]) => {
    try {
      setIsReordering(true);
      
      // Determine the active tenant
      const paramTenant = params?.tenantSlug as string;
      const savedTenant = typeof window !== 'undefined' ? localStorage.getItem("xfos-last-tenant") : null;
      const targetTenant = paramTenant || savedTenant;

      if (!targetTenant) {
        alert("No active session found. Please scan the QR code on your table again.");
        setIsReordering(false);
        return;
      }

      // We will loop through the items and add them sequentially to the cart
      // We use sequential to avoid race conditions in Zustand/API
      for (const item of items) {
        if (!item.menuItemId) continue; // safety check

        const variantId = item.variantSnapshot ? (item.variantSnapshot as any).id : undefined;
        const optionIds = item.optionsSnapshot 
          ? (item.optionsSnapshot as any[]).map(o => o.id) 
          : [];

        await addItem.mutateAsync({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPriceCents: item.priceCents,
          variantId,
          optionIds,
          notes: item.notes || undefined,
        });
      }

      // Redirect to the cart of the active tenant
      router.push(`/${targetTenant}/cart${query}`);
    } catch (error) {
      console.error("Failed to re-order:", error);
      alert("Failed to add items to cart. Please try again.");
    } finally {
      setIsReordering(false);
    }
  };

  return {
    handleOrderAgain,
    isReordering,
  };
}
