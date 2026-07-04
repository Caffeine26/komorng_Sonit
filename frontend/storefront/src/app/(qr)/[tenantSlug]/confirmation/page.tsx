"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { GlassHeader } from "@/components/layout/GlassHeader";
import { ConfirmationLoader } from "@/components/layout/ConfirmationLoader";
import { OrderReceipt } from "@/features/orders/components/OrderReceipt";

export default function OrderConfirmationPage() {
  const router = useRouter();
  const { tenantSlug } = useParams() as { tenantSlug: string };
  const base = `/${tenantSlug}`;
  const globalBase = ``;

  const [orderId] = useState(() => `XW-${Math.floor(100000 + Math.random() * 900000)}`);
  const [status, setStatus] = useState<"confirming" | "status_page">("confirming");

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus("status_page");
    }, 3000); 
    return () => clearTimeout(timer);
  }, []);

  const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }).toLowerCase();

  const handleBrowseMore = () => {
    router.push(base);
  };

  const handleSendToTelegram = () => {
    // Logic for telegram receipt
  };

  return (
    <main className="min-h-screen bg-[#F5F5F5] font-sans selection:bg-primary/20 pb-32 overflow-x-hidden relative">
      {/* 1. LOADING LAYER */}
      <AnimatePresence>
        {status === "confirming" && (
          <ConfirmationLoader />
        )}
      </AnimatePresence>

      {/* 2. CONFIRMATION CONTENT LAYER */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: status === "status_page" ? 1 : 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-[1000px] mx-auto w-full relative z-10"
      >
        <GlassHeader 
          title="Confirmation" 
          onBack={() => router.push(base)} 
        />

        <div className="pt-2 px-6 pb-24 flex flex-col lg:flex-row gap-8 items-start">
          {/* Left: Reusable XFOS Receipt Component */}
          <div className="w-full lg:flex-1">
            <OrderReceipt 
              orderId={orderId}
              date={currentDate}
              time={currentTime}
              items={[
                { name: "LokLak", quantity: 1, price: 5.00 }
              ]}
              totalAmount={5.50}
              status="Order succeeded"
              tableName="1"
              showGif={true}
            />
          </div>

          {/* Right: Action Buttons (Dual Color) */}
          <div className="w-full lg:w-[360px] lg:sticky lg:top-24 shrink-0 flex flex-col gap-4 mt-8 lg:mt-0">
            <div className="flex gap-3 w-full">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleBrowseMore}
                className="flex-1 h-[64px] rounded-[20px] bg-primary text-white font-bold text-[15px] tracking-tight shadow-lg shadow-primary/20 flex items-center justify-center"
              >
                Browse more
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSendToTelegram}
                className="flex-1 h-[64px] rounded-[20px] bg-[#0088CC] text-white font-bold text-[15px] tracking-tight shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                Telegram
              </motion.button>
            </div>

            <button
              onClick={() => router.push(`${globalBase}/o`)}
              className="w-full h-[64px] rounded-[20px] bg-white border border-zinc-200 text-zinc-900 font-bold text-[15px] flex items-center justify-center gap-2 active:bg-zinc-50 transition-colors"
            >
              Track your order <ArrowRight size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
