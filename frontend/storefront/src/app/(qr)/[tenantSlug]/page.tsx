"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useLocale } from "@/providers/locale-provider";
import { useTranslation } from "@/lib/i18n";
import { motion } from "framer-motion";

// Import from feature public APIs (index.ts) — never from internal paths
import { CustomerHeader } from "@/components/layout/CustomerHeader";
import { ActiveOrderTracker } from "@/components/layout/ActiveOrderTracker";
import { CustomerSidebar } from "@/components/layout/CustomerSidebar";
import {
  CategorySlider,
  FeaturedProducts,
  MainProductList,
  SearchSection,
  ProductDetailSheet,
} from "@/features/menu-browse";
import { CartFooter } from "@/features/cart";
import { getStorefrontContext } from "@/lib/api/storefront";
import { ConfirmationLoader } from "@/components/layout/ConfirmationLoader";

/**
 * 🍱 Customer Panel Page
 * 
 * This is the "Brain" of the customer experience.
 * It coordinates data fetching from the merchant context and passes 
 * logic down to specialized Liquid Glass components.
 */
export default function CustomerPanelPage() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;
  const { locale } = useLocale();
  const { t } = useTranslation();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    if (!tenantSlug) return;
    setLoading(true);
    getStorefrontContext(tenantSlug)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load storefront context", err);
        setError(err);
        setLoading(false);
      });
  }, [tenantSlug]);

  const tenant = data?.tenant || { name: { en: tenantSlug || "Storefront", km: null } };

  const categories = useMemo(() => {
    if (!data?.menu?.categories) return [];
    
    // Add "All" category at the beginning
    return [
      { id: "all", name: { en: "All", km: "ទាំងអស់" }, imageUrl: "/icons/all.png" },
      ...data.menu.categories.map((c: any) => ({
        id: c.id,
        name: c.name,
        imageUrl: c.imageUrl
      }))
    ];
  }, [data]);

  const products = useMemo(() => {
    if (!data?.menu?.categories) return [];
    
    const allProducts: any[] = [];
    data.menu.categories.forEach((cat: any) => {
      cat.items.forEach((item: any) => {
        allProducts.push({
          id: item.id,
          categoryId: cat.id,
          name: locale === "km" ? (item.name.km || item.name.en || "") : (item.name.en || item.name.km || ""),
          nameEn: item.name.en,
          nameKm: item.name.km,
          basePriceCents: item.priceCents,
          price: item.priceCents / 100,
          description: locale === "km" ? (item.description?.km || item.description?.en || "") : (item.description?.en || item.description?.km || ""),
          descriptionEn: item.description?.en,
          descriptionKm: item.description?.km,
          imageUrl: item.imageUrl || "https://placehold.co/400x400/png",
          variants: item.variants || [],
          optionGroups: item.optionGroups || [],
          isAvailable: item.available
        });
      });
    });
    
    return allProducts;
  }, [data, locale]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Persist user's layout preference across page navigations
  useEffect(() => {
    const savedMode = localStorage.getItem("xfos-view-mode");
    if (savedMode === "grid" || savedMode === "list") {
      setViewMode(savedMode);
    }
  }, []);

  const handleSetViewMode = (v: string) => {
    setViewMode(v as "grid" | "list");
    localStorage.setItem("xfos-view-mode", v);
  };

  // 3. Filter Logic
  const filteredProducts = useMemo(() => {
    if (!selectedCategoryId || selectedCategoryId === "all") return products;
    return products.filter((p) => p.categoryId === selectedCategoryId);
  }, [products, selectedCategoryId]);

  // Featured Products (Simple logic: first 4 items or products with higher price/featured flag)
  const featuredItems = useMemo(() => {
    return products.slice(0, 4);
  }, [products]);

  const isInitialLoading = loading;

  if (isInitialLoading) {
    return (
      <div className="min-h-screen relative bg-white">
        <ConfirmationLoader
          title={t("confirmation.loadingMenu")}
          description={t("confirmation.loadingMenuDesc")}
          fullScreen={true}
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[var(--color-background-sunken)] flex flex-col items-center justify-center p-8 text-center gap-10">
        <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center border border-zinc-100 shadow-sm text-red-500 text-2xl font-bold">
          !
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Failed to load menu</h2>
          <p className="text-zinc-400 text-sm font-medium">Please scan the QR code or try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-zinc-50 via-zinc-100/50 to-zinc-100 pb-40 selection:bg-primary/20">
      {/* ─── Sidebar ─────────────────────────────────────────────────── */}
      <CustomerSidebar
        isSidebarOpen={isSidebarOpen}
        setSidebarOpen={setIsSidebarOpen}
        viewMode={viewMode}
        setViewMode={handleSetViewMode}
      />

      {/* ─── Fixed Header ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto">
        <CustomerHeader
          merchantName={
            typeof tenant?.name === 'string' 
              ? tenant.name 
              : (locale === 'km' && tenant?.name?.km ? tenant.name.km : (tenant?.name?.en || tenantSlug))
          }
          toggleSidebar={() => setIsSidebarOpen(true)}
        />
        <ActiveOrderTracker />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-7xl mx-auto"
      >
        {/* ─── Horizontal Categories ───────────────────────────────────── */}
        <CategorySlider 
          categories={categories} 
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />

        {/* ─── Most Popular Section ────────────────────────────────────── */}
        <FeaturedProducts 
          products={featuredItems} 
          onProductClick={setSelectedProduct}
        />

        {/* ─── Main Menu Section (Grid/List Hybrid) ───────────────────── */}
        {selectedCategoryId === "all" ? (
          <div className="pb-32">
            {categories.map((category) => {
              const catProducts = products.filter((p) => p.categoryId === category.id);
              if (catProducts.length === 0) return null;
              
              return (
                <MainProductList 
                  key={category.id}
                  title={locale === "km" ? (category.name.km || category.name.en) : category.name.en}
                  products={catProducts.slice(0, 6)} // show up to 6 items per category section
                  showSeeAll={catProducts.length > 6}
                  onSeeAll={() => setSelectedCategoryId(category.id)}
                  viewMode={viewMode}
                  onProductClick={setSelectedProduct}
                />
              );
            })}
          </div>
        ) : (
          <div className="pb-32">
            <MainProductList 
              title={
                (() => {
                  const cat = categories.find((c) => c.id === selectedCategoryId);
                  if (!cat) return "Selection";
                  return locale === "km" ? (cat.name.km || cat.name.en) : cat.name.en;
                })()
              }
              products={filteredProducts} 
              viewMode={viewMode}
              onProductClick={setSelectedProduct}
            />
          </div>
        )}
      </motion.div>

      {/* ─── Product Detail Sheet (Modal) ────────────────────────────── */}
      <ProductDetailSheet 
        isOpen={!!selectedProduct} 
        onClose={() => setSelectedProduct(null)} 
        product={selectedProduct} 
      />

      {/* ─── Permanent Bottom Nav + CTA ──────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto">
          <CartFooter />
        </div>
      </div>
    </main>
  );
}
