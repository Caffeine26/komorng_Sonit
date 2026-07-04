"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/providers/locale-provider";
import { ArrowRight } from "lucide-react";
import { GlassHeader } from "@/components/layout/GlassHeader";
import { ConfirmationLoader } from "@/components/layout/ConfirmationLoader";
import { InvoiceCard, InvoiceData } from "@/features/checkout";
import { useCart } from "@/features/cart";
import { getStorefrontContext } from "@/lib/api/storefront";
import { useQrSession } from "@/lib/hooks/useQrSession";
import { useAuth } from "@/features/customer/hooks/useAuth";
import type { SubmitOrderStorefrontInput } from "@xfos/contracts-bff-storefront";
import { useTranslation } from "@/lib/i18n";
export default function CheckoutPage() {
  const router = useRouter();
  const { tenantSlug } = useParams() as { tenantSlug: string };
  const { locale } = useLocale();
  const { qrToken: qr, sessionId: resolvedSessionId, tableId: resolvedTableId, tableRef: resolvedTable, qrContextId: resolvedQrContextId, isLoading: isQrLoading } = useQrSession();
  const { t } = useTranslation();
  const query = qr ? `?qr=${qr}` : '';
  const base = `/${tenantSlug}`;

  const { cart, placeOrder } = useCart();
  const { user } = useAuth();
  const [productsMap, setProductsMap] = useState<Record<string, any>>({});
  const [codePrefix, setCodePrefix] = useState<string>("XW");
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!tenantSlug) return;
    setLoading(true);

    const promises: Promise<any>[] = [getStorefrontContext(tenantSlug)];

    Promise.all(promises)
      .then(([res]) => {

        const map: Record<string, any> = {};
        res.menu.categories.forEach((cat: any) => {
          cat.items.forEach((item: any) => {
            map[item.id] = {
              nameEn: item.name.en,
              nameKm: item.name.km,
              restaurantName: typeof res.tenant?.name === 'string'
                ? res.tenant.name
                : (res.tenant?.name?.en || res.tenant?.name?.km),
              restaurantNameKm: typeof res.tenant?.name === 'string'
                ? res.tenant.name
                : (res.tenant?.name?.km || res.tenant?.name?.en),
              logoUrl: res.tenant?.logoUrl || null,
            };
          });
        });
        setProductsMap(map);
        if (res.tenant?.codePrefix) {
          setCodePrefix(res.tenant.codePrefix);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load storefront context in checkout", err);
        setLoading(false);
      });
  }, [tenantSlug, locale]);

  const items = [...(cart?.items || [])].filter((i: any) => i && i.id).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
  const subtotal = (cart?.subtotalCents || 0) / 100;
  const total = subtotal;

  const currentDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  // Get generic restaurant info (from the first product mapped or fallback)
  const firstProductInfo = Object.values(productsMap)[0] || {};
  const restaurantName = locale === 'km' ? (firstProductInfo.restaurantNameKm || firstProductInfo.restaurantName || "Our Restaurant") : (firstProductInfo.restaurantName || firstProductInfo.restaurantNameKm || "Our Restaurant");
  const restaurantLogo = firstProductInfo.logoUrl || null;
  const tableName = resolvedTable || "Walk-in";

  const invoiceData: InvoiceData = {
    order_number: `#${codePrefix}-${cart?.cartId ? cart.cartId.substring(0, 5).toUpperCase() : "PENDING"}`,
    order_time: `${currentDate}, ${currentTime}`,
    restaurant_name: restaurantName,
    restaurant_logo: restaurantLogo,
    restaurant_address: `${tableName}`,
    customer_name: user?.fullName || user?.email || t('profile.guest'),
    items: items.map(item => {
      const pInfo = productsMap[item.menuItemId] || { nameEn: "Unknown Item", nameKm: "Unknown Item" };
      let finalName = locale === 'km' ? (pInfo.nameKm || pInfo.nameEn) : (pInfo.nameEn || pInfo.nameKm);
      if (item.variantSnapshot) {
        const vSnap = item.variantSnapshot as any;
        const vName = locale === 'km' && vSnap.nameKm ? vSnap.nameKm : (vSnap.nameEn || vSnap.variantName);
        finalName += ` (${vName})`;
      }
      if (item.optionsSnapshot && item.optionsSnapshot.length > 0) {
        const opts = item.optionsSnapshot.map((o: any) => locale === 'km' && o.nameKm ? o.nameKm : (o.nameEn || o.name)).join(', ');
        finalName += ` + ${opts}`;
      }

      return {
        item: finalName,
        qty: item.quantity,
        unit_price: item.unitPriceCents / 100,
        price: item.lineTotalCents / 100,
        instructions: item.notes || undefined,
      };
    }),
    subtotal: subtotal,
    total: total
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFinalizeOrder = async () => {
    try {
      if (!cart?.cartId) {
        alert('Cart is empty. Cannot place order.');
        return;
      }
      if (!resolvedSessionId) {
        alert('Session not resolved. Please scan QR again.');
        return;
      }
      
      setIsSubmitting(true); // Lock the UI into the loading state
      
      const result = await placeOrder.mutateAsync({
        cartId: cart.cartId,
        sessionId: resolvedSessionId,
        tableRef: resolvedTable || undefined,
        tableId: resolvedTableId || undefined,
        qrContextId: resolvedQrContextId || undefined,
        locale: locale as 'en' | 'km',
      } as SubmitOrderStorefrontInput);
      
      // Artificial delay so the beautiful loader is actually visible for a moment
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Navigate to the order confirmation route using the returned token
      const successParam = query ? '&success=true' : '?success=true';
      router.push(`/o/${result.orderToken}${query}${successParam}`);
    } catch (err) {
      setIsSubmitting(false); // Only reset if there's an error
      alert("Failed to place order. Please try again.");
    }
  };

  const showLoader = !mounted || loading || isSubmitting || isQrLoading;
  
  if (showLoader) {
    return (
      <div className="min-h-screen relative bg-[var(--color-background-sunken)]">
        <ConfirmationLoader 
          title={isSubmitting ? t("checkout.submittingTitle") : t("checkout.loadingTitle")} 
          description={isSubmitting ? t("checkout.submittingDesc") : t("checkout.loadingDesc")}
          fullScreen={true}
        />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-background-sunken)] font-sans pb-32 selection:bg-primary/20">
      {/* 🧊 Glass Header Wrapper to prevent stretching */}
      <div className="max-w-[1200px] mx-auto w-full">
        <GlassHeader
          title={t("checkout.title")}
          onBack={() => router.push(`${base}/cart${query}`)}
        />
      </div>

      <div className="px-5 pt-4 pb-10 max-w-[1200px] mx-auto w-full animate-ui-entry">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* 🧾 LEFT / TOP: INVOICE CARD */}
          <div className="w-full lg:flex-1">
            <InvoiceCard data={invoiceData} />
          </div>

          {/* 💳 RIGHT / BOTTOM: CONFIRMATION BUTTON */}
          <div className="w-full lg:w-[400px] lg:sticky lg:top-24 shrink-0 space-y-8 pt-4">
              <button
                onClick={handleFinalizeOrder}
                disabled={placeOrder.isPending || items.length === 0}
                className="w-full btn-primary h-[76px] flex items-center justify-center gap-3 shadow-lg shadow-primary/30 disabled:opacity-70"
              >
                {placeOrder.isPending ? t("common.loading") : (
                  <>
                    {t("checkout.confirmOrder")} <ArrowRight size={22} strokeWidth={3} />
                  </>
                )}
              </button>
          </div>
        </div>
      </div>
    </main>
  );
}
