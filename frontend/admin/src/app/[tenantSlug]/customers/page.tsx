"use client";
import { useLocale } from "next-intl";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Users, Search, RefreshCw, X, ChevronRight, ShoppingBag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCustomers } from "@/features/customers/hooks/useCustomers";
import { useTenant } from "@/features/tenant/providers/TenantProvider";
import { resolveMediaUrl } from "@/lib/utils/media-url";
import { getAdminOrdersList } from "@/lib/api/order";
import { CustomerMessaging } from "@/features/marketing/components/CustomerMessaging";
import { useTranslations } from "next-intl";

export default function CustomersPage() {
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;
  const locale = useLocale()
  const router = useRouter();
  const t = useTranslations("customers");
  const { tenant, isLoading: isTenantLoading } = useTenant();

  const { data: customers = [], isLoading: loadingCustomers, refetch } = useCustomers(tenantSlug);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Messaging is handled inside CustomerMessaging component

  useEffect(() => {
    if (!isTenantLoading && tenant) {
      const roles: string[] = (tenant as any)?.currentUser?.roles || [];
      const isOwnerOrManagerOrStaff = roles.includes('TENANT_OWNER') || roles.includes('TENANT_MANAGER') || roles.includes('SERVICE_STAFF') || roles.includes('PLATFORM_ADMIN');
      if (!isOwnerOrManagerOrStaff) {
        router.replace(`/${tenantSlug}/orders`);
      }
    }
  }, [tenant, isTenantLoading, locale, tenantSlug, router]);

  const loadCustomerOrders = async (customer: any) => {
    setSelectedCustomer(customer);
    setLoadingOrders(true);
    try {
      const orders = await getAdminOrdersList(tenantSlug, undefined, customer.id);
      setCustomerOrders(orders);
    } catch (err) {
      console.error("Failed to load customer orders", err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c: any) => c.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-50/10 flex flex-col animate-ui-entry">

      {/* ── TOP BAR: Liquid Glass Layout ── */}
      <header className="py-6 sm:py-8 px-4 md:px-8 lg:px-10 flex flex-col lg:flex-row lg:items-center gap-6 justify-between flex-shrink-0 relative z-50 bg-zinc-50/10">
        <div className="flex flex-col">
          <h1 className="text-[24px] sm:text-[30px] font-medium text-zinc-950 tracking-tight leading-none">{t('title')}</h1>
          <p className="text-[13px] sm:text-[15px] font-normal text-zinc-400 mt-2">{t('desc')}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 flex-1 w-full lg:w-auto lg:justify-end">
          <div className="relative w-full sm:w-72 group">
            <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-300 group-focus-within:text-primary transition-colors duration-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search')}
              className="w-full h-14 pl-14 pr-6 bg-white/80 backdrop-blur-sm border border-zinc-100/50 rounded-[22px] text-[14px] font-normal text-zinc-950 focus:outline-none focus:bg-white focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all duration-300 shadow-sm"
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={() => refetch()}
              disabled={loadingCustomers}
              className="w-14 h-14 bg-white/80 backdrop-blur-sm border border-zinc-100/50 rounded-[22px] flex items-center justify-center text-zinc-950 hover:bg-white hover:text-primary hover:border-primary/20 transition-all duration-300 shadow-sm cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={20} className={cn(loadingCustomers && "animate-spin")} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 items-start w-full relative px-4 md:px-8 lg:px-10 pb-24 gap-6">

        {/* CUSTOMERS LIST */}
        <main className={cn("flex-1 w-full transition-all duration-500", selectedCustomer ? "lg:w-2/3" : "w-full")}>
          {loadingCustomers ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20">
              <RefreshCw size={40} className="animate-spin text-primary" />
              <p className="text-[14px] text-zinc-400 mt-4">{t('loading')}</p>
            </div>
          ) : (
            <div className="bg-white rounded-[24px] border border-zinc-100 shadow-sm overflow-hidden">
              <table className="w-full text-[14px]">
                <thead className="bg-zinc-50/50 border-b border-zinc-100">
                  <tr>
                    <th className="px-6 py-4 text-left font-medium text-zinc-500 text-[13px]">{t('customer')}</th>
                    <th className="px-6 py-4 text-left font-medium text-zinc-500 text-[13px]">{t('phone')}</th>
                    <th className="px-6 py-4 text-center font-medium text-zinc-500 text-[13px]">{t('total_orders')}</th>
                    <th className="px-6 py-4 text-right font-medium text-zinc-500 text-[13px]">{t('total_spent')}</th>
                    <th className="px-6 py-4 text-right font-medium text-zinc-500 text-[13px]">{t('last_visit')}</th>
                    <th className="px-4 py-4 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center text-zinc-300 mb-6">
                          <Users size={32} />
                        </div>
                        <h3 className="text-[18px] font-normal text-zinc-950 tracking-tight">{t('no_customers')}</h3>
                        <p className="text-[14px] font-normal text-zinc-400 mt-2 max-w-xs mx-auto">{t('no_customers_desc')}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((customer: any) => (
                      <tr
                        key={customer.id}
                        onClick={() => loadCustomerOrders(customer)}
                        className={cn(
                          "group hover:bg-zinc-50 transition-colors cursor-pointer",
                          selectedCustomer?.id === customer.id && "bg-primary/5 hover:bg-primary/5"
                        )}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                              {customer.avatarUrl ? (
                                <img src={resolveMediaUrl(customer.avatarUrl)} alt="Avatar" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-primary font-medium text-[12px]">
                                  {customer.fullName?.substring(0, 2).toUpperCase() || 'GU'}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-zinc-900">{customer.fullName || t('guest')}</div>
                              {customer.isVip && (
                                <span className="inline-block mt-0.5 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full uppercase">{t('vip')}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-left font-medium text-zinc-900 text-[13px]">
                          {customer.phone ? (
                            <span className="text-zinc-900 font-medium">
                              {customer.phone.startsWith('+855')
                                ? '0' + customer.phone.slice(4)
                                : customer.phone.startsWith('855')
                                ? '0' + customer.phone.slice(3)
                                : customer.phone}
                            </span>
                          ) : (
                            <span className="text-zinc-400">N/A</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-zinc-900">
                          {customer.totalOrders}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-zinc-900 tabular-nums">
                          ${(customer.totalSpentCents / 100).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right text-zinc-500 text-[13px]">
                          {customer.lastVisitAt ? new Date(customer.lastVisitAt).toLocaleDateString() : t('never')}
                        </td>
                        <td className="px-4 py-4 text-right text-zinc-300 group-hover:text-primary transition-colors">
                          <ChevronRight size={18} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* CUSTOMER DETAILS & ORDERS SIDEBAR */}
        {selectedCustomer && (
          <aside className="w-full lg:w-[400px] shrink-0 animate-ui-entry">
            <div className="bg-white rounded-[24px] border border-zinc-100 shadow-sm p-6 sticky top-8">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                    {selectedCustomer.avatarUrl ? (
                      <img src={resolveMediaUrl(selectedCustomer.avatarUrl)} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-primary font-medium text-[16px]">
                        {selectedCustomer.fullName?.substring(0, 2).toUpperCase() || 'GU'}
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-[18px] font-medium text-zinc-900">{selectedCustomer.fullName || t('guest')}</h2>
                    <p className="text-[13px] text-zinc-500">{t('since')} {new Date(selectedCustomer.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-50 text-zinc-400 hover:bg-zinc-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-zinc-50 p-4 rounded-2xl">
                    <p className="text-[12px] font-medium text-zinc-500 uppercase tracking-wider mb-1">{t('total_spent')}</p>
                    <p className="text-[20px] font-medium text-zinc-900 tabular-nums">${(selectedCustomer.totalSpentCents / 100).toFixed(2)}</p>
                  </div>
                  <div className="bg-zinc-50 p-4 rounded-2xl">
                    <p className="text-[12px] font-medium text-zinc-500 uppercase tracking-wider mb-1">{t('orders')}</p>
                    <p className="text-[20px] font-medium text-zinc-900">{selectedCustomer.totalOrders}</p>
                  </div>
                </div>

                <h3 className="text-[15px] font-medium text-zinc-900 mb-4 flex items-center gap-2">
                  <ShoppingBag size={16} className="text-zinc-400" />
                  {t('history')}
                </h3>

              {loadingOrders ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : customerOrders.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 text-[14px]">
                  {t('no_orders')}
                </div>
              ) : (
                <div className="space-y-3 max-h-[30vh] overflow-y-auto no-scrollbar pr-2 mb-6">
                  {customerOrders.map(order => (
                    <div key={order.orderId} className="p-4 border border-zinc-100 rounded-2xl hover:border-zinc-200 transition-colors bg-white">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-zinc-900">{order.orderNumber}</span>
                        <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                          {order.status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[13px]">
                        <span className="text-zinc-500">{new Date(order.createdAt).toLocaleDateString()}</span>
                        <span className="font-medium text-zinc-900 tabular-nums">${(order.totalCents / 100).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* DIRECT MESSAGING SECTION */}
              <div className="pt-6 border-t border-zinc-100 mt-auto">
                <h3 className="text-[15px] font-medium text-zinc-900 mb-4 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
                  {t('send_msg')}
                </h3>
                <CustomerMessaging
                  tenantSlug={tenantSlug}
                  selectedCustomerIds={[selectedCustomer.id]}
                />
              </div>
            </div>
          </aside>
        )}

      </div>
    </div>
  );
}
