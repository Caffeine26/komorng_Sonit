import React from "react";
import { Clock, Award } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface ProductInfoProps {
  name: string;
  price: number;
  description?: string;
}

export const ProductInfo = ({ name, price, description }: ProductInfoProps) => {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex justify-between items-start gap-4 mb-3">
        <h1 className="font-jakarta font-black text-[28px] leading-[1.1] text-zinc-900">
          {name}
        </h1>
        <span className="font-black text-[22px] text-primary shrink-0 mt-1">
          ${price.toFixed(2)}
        </span>
      </div>
      
      <p className="text-[15px] text-zinc-500 font-medium leading-relaxed mb-6">
        {description || "A premium Wagyu beef patty seasoned with sea salt and black pepper, topped with melted gruyere, caramelized onions, and our secret truffle aioli on a toasted brioche bun."}
      </p>

      <div className="flex flex-wrap gap-2 mb-8">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-zinc-200/60 shadow-sm">
          <Award size={14} className="text-zinc-500" />
          <span className="text-[12px] font-bold text-zinc-600">{t("product.bestSeller")}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-zinc-200/60 shadow-sm">
          <Clock size={14} className="text-zinc-500" />
          <span className="text-[12px] font-bold text-zinc-600">{t("product.time")}</span>
        </div>
      </div>
    </>
  );
};
