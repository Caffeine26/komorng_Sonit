import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTranslation } from '@/lib/i18n';

export interface InvoiceItem {
  item: string;
  qty: number;
  unit_price: number | string;
  price: number | string;
  instructions?: string;
}

export interface InvoiceData {
  order_number: string;
  order_time: string;
  restaurant_name: string;
  restaurant_logo?: string | null;
  restaurant_address?: string;
  customer_name: string;
  customer_address?: string;
  items: InvoiceItem[];
  subtotal: number | string;
  delivery_fee?: number | string;
  discount?: number | string;
  total: number | string;
}

interface InvoiceCardProps {
  data: InvoiceData;
  className?: string;
}

export const InvoiceCard: React.FC<InvoiceCardProps> = ({ data, className }) => {
  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const { t, locale } = useTranslation();

  return (
    <div className={cn("w-full bg-white rounded-[16px] shadow-sm p-6 space-y-5 border border-[var(--color-border)] font-sans animate-ui-entry", className)}>
      {/* ── Section: Header (Branding) ── */}
      <div className="flex flex-row justify-between items-center">
        <div className="text-[24px] font-black tracking-tighter flex items-center gap-3">
          {data.restaurant_logo ? (
            <div className="relative w-12 h-12 rounded-[12px] overflow-hidden border border-zinc-100 shadow-sm shrink-0">
              <img src={data.restaurant_logo} alt={data.restaurant_name} className="object-contain w-full h-full bg-white p-1" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-[12px] bg-primary flex items-center justify-center text-white shadow-primary/20 shadow-lg shrink-0">
              <ShoppingBag size={24} strokeWidth={2.5} />
            </div>
          )}
          <div className="text-[var(--color-foreground)]">
            {data.restaurant_name}
          </div>
        </div>
      </div>

      {/* ── Section: Intro ── */}
      <div className="space-y-1">
        <h2 className="text-[var(--color-foreground)] text-[18px] font-extrabold tracking-tight">{t('invoice.thankYou')}</h2>
        <p className="text-[var(--color-muted)] text-[14px] font-medium">{t('invoice.receiptSummary')}</p>
      </div>

      {/* ── Section: Metadata (Grid 2-Col) ── */}
      <div className="grid grid-cols-2 gap-y-4 gap-x-6 border-t border-[var(--color-border)] pt-5">
        <div>
          <label className="block text-[12px] font-bold tracking-wider text-[var(--color-muted)] mb-0.5">{t('invoice.orderNo')}</label>
          <span className="text-[14px] font-semibold text-[var(--color-foreground)]">{data.order_number}</span>
        </div>
        <div>
          <label className="block text-[12px] font-bold tracking-wider text-[var(--color-muted)] mb-0.5">{t('invoice.orderTime')}</label>
          <span className="text-[14px] font-semibold text-[var(--color-foreground)]">{data.order_time}</span>
        </div>

        {data.restaurant_address && (
          <div>
            <label className="block text-[12px] font-bold tracking-wider text-[var(--color-muted)] mb-0.5">{t('invoice.table')}</label>
            <span className="text-[14px] font-semibold text-[var(--color-foreground)] line-clamp-2">{data.restaurant_address}</span>
          </div>
        )}
        <div>
          <label className="block text-[12px] font-bold tracking-wider text-[var(--color-muted)] mb-0.5">{t('invoice.customer')}</label>
          <span className="text-[14px] font-semibold text-[var(--color-foreground)]">{data.customer_name}</span>
        </div>
      </div>

      {/* ── Section: Items Table ── */}
      <div className="overflow-hidden rounded-[12px] border border-[var(--color-border)] mt-6">
        <table className="w-full text-[14px]">
          <thead className="bg-[var(--color-background-secondary)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-4 py-2.5 text-left font-bold text-[var(--color-muted)] text-[12px] tracking-wider w-[10%]">{t('invoice.no')}</th>
              <th className="px-4 py-2.5 text-left font-bold text-[var(--color-muted)] text-[12px] tracking-wider">{t('invoice.itemName')}</th>
              <th className="px-3 py-2.5 text-center font-bold text-[var(--color-muted)] text-[12px] tracking-wider">{t('invoice.qty')}</th>
              <th className="px-4 py-2.5 text-right font-bold text-[var(--color-muted)] text-[12px] tracking-wider">{t('invoice.price')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {data.items.map((item, idx) => (
              <tr key={idx} className="text-[var(--color-foreground)] hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-3.5 text-left font-bold text-zinc-500">{idx + 1}</td>
                <td className="px-4 py-3.5 text-left">
                  <div className="font-bold">
                    {(() => {
                      const nameParts = (item.item || '').split(' / ');
                      const nameKm = nameParts[0] || item.item;
                      const nameEn = nameParts[1] || item.item;
                      return locale === 'km' ? nameKm : nameEn;
                    })()}
                  </div>
                  {item.instructions && (
                    <div className="text-[11px] font-medium text-primary/80 mt-0.5 line-clamp-1 italic">
                      {t('invoice.note')} {item.instructions}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3.5 text-center font-semibold text-zinc-500">x{item.qty}</td>
                <td className="px-4 py-3.5 text-right font-bold">{formatCurrency(item.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Section: Summary ── */}
      <div className="flex flex-col items-end space-y-3 pt-5 border-t border-dashed border-[var(--color-border)]">
        <div className="flex justify-between w-full max-w-[200px] items-center">
          <label className="text-[13px] font-bold text-[var(--color-muted)]">{t('cart.subtotal')}</label>
          <span className="text-[15px] font-bold text-[var(--color-foreground)] tabular-nums">{formatCurrency(data.subtotal)}</span>
        </div>
      </div>

      {/* ── Section: Total ── */}
      <div className="bg-[var(--color-background-secondary)] p-5 rounded-[14px] border border-[var(--color-border)] mt-6 shadow-inner space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-[16px] font-black text-[var(--color-foreground)] tracking-tight">{t('invoice.grandTotal')}</span>
          <span className="text-[24px] font-black text-primary tabular-nums tracking-tighter">{formatCurrency(data.total)}</span>
        </div>

        {/* Exchange Price (KHR) */}
        <div className="flex justify-between items-center opacity-60">
          <span className="text-[12px] font-bold text-zinc-500 italic">{t('invoice.exchangeRate')}</span>
          <span className="text-[15px] font-black text-zinc-700 tabular-nums">
            ៛{(Number(data.total) * 4000).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
