"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { getAdminOrdersList } from "@/lib/api/order";
import { playAdminSound } from "@/lib/adminSoundUtils";

/**
 * Polls orders globally so the header bell updates even off the /orders page.
 */
export function useAdminOrdersAttention() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;
  const prevSnapshotRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!tenantSlug) return;

    const poll = async () => {
      try {
        const data = await getAdminOrdersList(tenantSlug);
        const mapped = data.map((apiOrder: any) => ({
          id: apiOrder.orderId,
          tableRef: apiOrder.tableRef,
          tableId: apiOrder.tableId,
          status: apiOrder.status,
          needsAttention: apiOrder.needsAttention ?? false,
          items: (apiOrder.items || []).map((item: any) => ({
            isNewlyAdded: item.isNewlyAdded ?? false,
          })),
        }));

        const attentionOrders = mapped.filter((o) => o.needsAttention);
        const newOrders = mapped.filter(
          (o) => o.status === "SUBMITTED" && !o.needsAttention,
        );

        let newItemDelta = 0;
        for (const o of attentionOrders) {
          const newCount = o.items.filter((i: { isNewlyAdded: boolean }) => i.isNewlyAdded).length;
          const prev = prevSnapshotRef.current[o.id];
          if (prev !== undefined && newCount > prev) newItemDelta += newCount - prev;
          prevSnapshotRef.current[o.id] = newCount;
        }

        const isFirstLoad = prevSnapshotRef.current.__newOrdersCount === undefined;

        if (!isFirstLoad) {
          if (newItemDelta > 0) {
            playAdminSound("update");
          } else if (
            newOrders.length > prevSnapshotRef.current.__newOrdersCount
          ) {
            playAdminSound("order");
          }
        }
        prevSnapshotRef.current.__newOrdersCount = newOrders.length;

        const bellCount = attentionOrders.reduce(
          (sum, o) =>
            sum + o.items.filter((i: { isNewlyAdded: boolean }) => i.isNewlyAdded).length,
          0,
        );

        window.dispatchEvent(
          new CustomEvent("orders-attention-update", {
            detail: {
              count: bellCount,
              orders: attentionOrders,
              newOrdersCount: newOrders.length,
              newOrders,
            },
          }),
        );
      } catch {
        // ignore background poll errors
      }
    };

    poll();
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [tenantSlug]);
}
