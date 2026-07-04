"use client";

import React from "react";
import { motion } from "framer-motion";

import Image from "next/image";
import { cn } from "@/lib/utils/cn";

interface ConfirmationLoaderProps {
  title?: string;
  description?: string;
  fullScreen?: boolean;
}

/**
 * 🍱 ConfirmationLoader
 * High-fidelity interstitial loading screen with custom GIF.
 * Now generic and reusable across the storefront.
 */
export function ConfirmationLoader({
  title = "Loading",
  description = "Please wait a moment...",
  fullScreen = true,
}: ConfirmationLoaderProps) {
  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex flex-col items-center justify-center bg-white/90 backdrop-blur-md z-[110]",
        fullScreen ? "fixed inset-0" : "w-full h-full min-h-[300px] rounded-3xl"
      )}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center gap-8"
      >
        <Image
          src="/loadinground.gif"
          alt={title}
          width={160}
          height={160}
          unoptimized
          className="object-contain"
          style={{ width: "160px", height: "160px" }}
          draggable={false}
        />

        <div className="flex flex-col items-center gap-2 text-center px-6">
          <h2 className="text-[22px] font-black text-zinc-900 tracking-tighter">
            {title}
          </h2>
          <p className="text-[13px] font-medium text-zinc-400 tracking-wide">
            {description}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
