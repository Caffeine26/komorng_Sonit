"use client";

import React, { useRef, useState, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { useLocale } from "@/providers/locale-provider";

interface Category {
  id: string;
  name: {
    en: string;
    km: string;
  };
  imageUrl?: string | null;
}

interface CategorySliderProps {
  categories: Category[];
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
}

// 🔒 Global Session Lock
let globalCatHasCentered = false;

export const CategorySlider = React.memo(
  function CategorySlider({
    categories,
    selectedId,
    onSelect,
    className,
  }: CategorySliderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { locale } = useLocale();

  useEffect(() => {
    if (globalCatHasCentered || categories.length === 0) return;

    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el && el.clientWidth > 0) {
        el.scrollTo({ left: 0, behavior: 'auto' });
        globalCatHasCentered = true;
      }
    });
  }, [categories.length]);

  return (
    <div className={cn("w-full px-4 relative z-30 mt-4 overflow-visible", className)}>
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto no-scrollbar mx-1 px-1 snap-x snap-mandatory items-center overflow-visible py-2"
      >
        {categories.map((cat) => {
          const displayName = locale === 'km' ? (cat.name.km || cat.name.en) : cat.name.en;
          return (
            <CategoryItem
              key={cat.id}
              name={displayName}
              imageUrl={cat.imageUrl}
              active={selectedId === cat.id}
              onClick={() => onSelect(cat.id)}
            />
          );
        })}
      </div>
    </div>
  );
});

const CategoryItem = React.memo(
  function CategoryItem({
    name,
    imageUrl,
    active,
    onClick,
  }: {
    name: string;
    imageUrl?: string | null;
    active: boolean;
    onClick: () => void;
  }) {
    return (
  <motion.button
    whileTap={{ scale: 0.92 }}
    whileHover={{ y: -4 }}
    onClick={onClick}
    className="flex flex-col items-center gap-2 group shrink-0 w-[88px] focus:outline-none overflow-visible"
  >
    <div className="relative w-[72px] h-[72px] flex items-center justify-center overflow-visible">
      {imageUrl ? (
        <motion.div
          animate={active ? { scale: 1.15, y: -6 } : { scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 1000, damping: 25, mass: 0.2 }}
          className="relative w-[68px] h-[68px] overflow-visible"
        >
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="68px"
            className="object-contain filter drop-shadow-[0_6px_12px_rgba(0,0,0,0.12)] group-hover:drop-shadow-[0_10px_16px_rgba(0,0,0,0.18)] transition-all duration-350"
          />
        </motion.div>
      ) : (
        <div className="w-[60px] h-[60px] rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-100 shadow-sm">
          <span className="text-xl font-semibold capitalize font-jakarta text-zinc-400">
            {name.charAt(0)}
          </span>
        </div>
      )}
    </div>

    <span
      className={cn(
        "text-[12px] font-medium tracking-tight transition-all font-jakarta leading-normal text-center line-clamp-1 mt-1 pt-0.5",
        active ? "text-primary font-semibold scale-105" : "text-zinc-500 group-hover:text-zinc-800"
      )}
    >
      {name}
    </span>
  </motion.button>
  );
});
