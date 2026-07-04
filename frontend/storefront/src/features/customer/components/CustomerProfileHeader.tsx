"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { motion, Variants } from "framer-motion";
import { User } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useQrSessionContext } from "@/providers/qr-session-provider";
import { getCustomerIdentity } from "@/lib/api/storefront";
import { useTranslation } from "@/lib/i18n";

interface CustomerIdentity {
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

interface CustomerProfileHeaderProps {
  className?: string;
  itemVariants?: Variants;
}

export function CustomerProfileHeader({ className, itemVariants }: CustomerProfileHeaderProps) {
  const { qrToken, isLoading: isQrLoading } = useQrSessionContext();
  const { t } = useTranslation();

  const [customer, setCustomer] = useState<CustomerIdentity | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    if (isQrLoading || !qrToken) {
      if (!isQrLoading) setIsFetching(false);
      return;
    }

    let cancelled = false;
    setIsFetching(true);

    getCustomerIdentity(qrToken)
      .then((res) => {
        if (!cancelled) setCustomer(res.customer ?? null);
      })
      .catch(() => {
        if (!cancelled) setCustomer(null);
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });

    return () => { cancelled = true; };
  }, [qrToken, isQrLoading]);

  const isIdentified = !!customer;

  const content = (
    <div className={cn("w-full flex flex-col items-center pt-4", className)}>
      <div className="relative mb-4">
        <div
          className={cn(
            "absolute inset-0 blur-xl rounded-full scale-110 transition-colors duration-500",
            isIdentified ? "bg-primary/20" : "bg-zinc-200"
          )}
        />

        <div className="relative w-[100px] h-[100px] rounded-[36px] bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <div className="relative w-full h-full rounded-[30px] overflow-hidden bg-zinc-50 flex items-center justify-center">
            {isFetching ? (
              <div className="w-full h-full bg-zinc-200 animate-pulse rounded-[30px]" />
            ) : isIdentified && customer?.avatarUrl ? (
              <Image
                src={customer.avatarUrl}
                alt="Avatar"
                fill
                className="object-cover"
              />
            ) : isIdentified ? (
              <Image
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                  customer?.fullName || "C"
                )}&background=random&size=200`}
                alt="Avatar"
                fill
                className="object-cover"
              />
            ) : (
              <User size={40} className="text-zinc-300" strokeWidth={1.5} />
            )}
          </div>
        </div>
      </div>

      {/* Name */}
      <h2 className="font-jakarta font-black text-[24px] text-zinc-900 tracking-tight leading-normal mb-1.5 transition-all text-center">
        {isFetching ? (
          <span className="inline-block w-32 h-7 bg-zinc-200 animate-pulse rounded-full" />
        ) : isIdentified ? (
          customer?.fullName || t("profile.customer")
        ) : (
          t("profile.guest")
        )}
      </h2>

      {/* Phone / sub-label */}
      <p className="text-[14px] text-zinc-500 font-medium mb-6 text-center transition-all max-w-[200px]">
        {isFetching ? (
          <span className="inline-block w-40 h-4 bg-zinc-100 animate-pulse rounded-full" />
        ) : isIdentified ? (
          customer?.phone ?? t("profile.telegramMember")
        ) : (
          t("profile.guestDesc")
        )}
      </p>
    </div>
  );

  if (itemVariants) {
    return (
      <motion.div variants={itemVariants} className="w-full md:w-[320px] shrink-0">
        {content}
      </motion.div>
    );
  }

  return <div className="w-full md:w-[320px] shrink-0">{content}</div>;
}
