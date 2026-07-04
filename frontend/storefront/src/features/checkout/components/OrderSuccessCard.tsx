import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils/cn';
import { useTranslation } from '@/lib/i18n';

export interface OrderSuccessItem {
  item: string;
  qty: number;
  price: number | string;
  variantName?: string | null;
  options?: { name: string; priceDeltaCents?: number }[];
  notes?: string | null;
}

export interface OrderSuccessData {
  order_number: string;
  order_time: string;
  restaurant_name: string;
  restaurant_logo?: string | null;
  table_name?: string | null;
  customer_name?: string;
  items: OrderSuccessItem[];
  subtotal: number | string;
  total: number | string;
}

interface OrderSuccessCardProps {
  data: OrderSuccessData;
  className?: string;
}

export const OrderSuccessCard = ({ data, className }: OrderSuccessCardProps) => {
  const { t, locale } = useTranslation();

  return (
    <div className={cn("bg-white rounded-[24px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-zinc-100", className)}>
      <div className="flex items-center gap-3 mb-5">
        {data.restaurant_logo ? (
          <Image 
            src={data.restaurant_logo} 
            alt={data.restaurant_name} 
            width={36} 
            height={36}
            className="rounded-lg object-cover border border-zinc-100"
          />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
            {data.restaurant_name.charAt(0)}
          </div>
        )}
        <h2 className="text-base font-bold text-black">{data.restaurant_name}</h2>
      </div>

      <div className="mb-5">
        <h3 className="text-base font-bold text-black mb-1">{t("invoice.thankYou")}</h3>
        <p className="text-black text-[13px]">{t("invoice.receiptSummary")}</p>
      </div>

      <div className="h-px w-full bg-black mb-5" />

      <div className="grid grid-cols-2 gap-y-5 mb-6">
        <div>
          <p className="text-black text-[11px] font-bold mb-1">{t("invoice.orderNo")}</p>
          <p className="text-black text-[13px] font-bold">{data.order_number}</p>
        </div>
        <div>
          <p className="text-black text-[11px] font-bold mb-1">{t("invoice.orderTime")}</p>
          <p className="text-black text-[13px] font-bold">{data.order_time}</p>
        </div>
        <div>
          <p className="text-black text-[11px] font-bold mb-1">{t("invoice.table")}</p>
          <p className="text-black text-[13px] font-bold">{data.table_name && !data.table_name.startsWith('tbl_') ? data.table_name : "Phnom Penh"}</p>
        </div>
        <div>
          <p className="text-black text-[11px] font-bold mb-1">{t("invoice.customer")}</p>
          <p className="text-black text-[13px] font-bold">{data.customer_name || t("profile.guest")}</p>
        </div>
      </div>

      <div className="border border-black rounded-[12px] overflow-hidden mb-5">
        <table className="w-full text-[13px]">
          <thead className="bg-white border-b border-black">
            <tr>
              <th className="px-3 py-2.5 text-left font-bold text-black w-[10%] text-[11px]">{t("invoice.no")}</th>
              <th className="px-3 py-2.5 text-left font-bold text-black w-1/2 text-[11px]">{t("invoice.itemName")}</th>
              <th className="px-2 py-2.5 text-center font-bold text-black w-[20%] text-[11px]">{t("invoice.qty")}</th>
              <th className="px-3 py-2.5 text-right font-bold text-black w-[20%] text-[11px]">{t("invoice.price")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black">
            {data.items.map((item, idx) => (
              <tr key={idx} className="bg-white">
                <td className="px-3 py-3 font-bold text-black align-top">{idx + 1}</td>
                <td className="px-3 py-3 font-bold text-black align-top">
                  <div className="text-[13px]">
                    {(() => {
                      const nameParts = (item.item || '').split(' / ');
                      const nameKm = nameParts[0] || item.item;
                      const nameEn = nameParts[1] || item.item;
                      return locale === 'km' ? nameKm : nameEn;
                    })()}
                  </div>
                  
                  {(item.variantName || (item.options && item.options.length > 0) || item.notes) && (
                    <div className="flex flex-col gap-0.5 mt-1">
                      {item.variantName && (
                        <div className="text-[11px] font-medium text-[#8F8F8F]">
                          {t("invoice.size")} {item.variantName}
                        </div>
                      )}
                      
                      {item.options && item.options.length > 0 && item.options.map((opt, i) => (
                        <div key={i} className="text-[11px] font-medium text-[#8F8F8F]">
                          {t("invoice.addOn")} {opt.name}
                          {opt.priceDeltaCents && opt.priceDeltaCents > 0 ? (
                            <span className="opacity-60 ml-1">
                              (+${(opt.priceDeltaCents / 100).toFixed(2)})
                            </span>
                          ) : null}
                        </div>
                      ))}
                      
                      {item.notes && (
                        <div className="text-[11px] font-medium text-[#8F8F8F] italic mt-0.5">
                          {t("invoice.note")} {item.notes}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-2 py-3 text-center font-bold text-black align-top">x{item.qty}</td>
                <td className="px-3 py-3 text-right font-bold text-black align-top">${Number(item.price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-dashed border-black mb-5" />

      <div className="flex justify-end mb-5">
        <div className="w-[140px] flex justify-between items-center px-1">
          <span className="font-bold text-black text-[13px]">{t("invoice.subtotal")}</span>
          <span className="font-bold text-black text-[13px]">${Number(data.subtotal).toFixed(2)}</span>
        </div>
      </div>

      <div className="border border-black rounded-[14px] p-4 mb-2">
        <div className="flex justify-between items-center mb-4">
          <span className="text-base font-black text-black">{t("invoice.grandTotal")}</span>
          <span className="text-2xl font-black text-[#E91E63]">${Number(data.total).toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px] font-bold text-black italic">{t("invoice.exchangeRate")}</span>
          <span className="text-[13px] font-black text-black">
            ៛{(Number(data.total) * 4000).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
