"use client";

import {
  Banknote,
  ShoppingBag,
  Clock,
  LayoutGrid,
  ChevronDown,
  UtensilsCrossed,
  ChefHat
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { useTenant } from "@/features/tenant/providers/TenantProvider";
import { useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { useTranslations } from "next-intl";

export default function HomePage() {
  const { tenant, isLoading } = useTenant();
  const router = useRouter();
  const { locale, tenantSlug } = useParams();
  const t = useTranslations("dashboard");
  console.log('[Dashboard] render start – isLoading:', isLoading, 'tenant:', tenant);

  useEffect(() => {
    if (!isLoading && tenant) {
      router.replace(`/${tenantSlug}/orders`);
    }
  }, [tenant, isLoading, tenantSlug, router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );
}
