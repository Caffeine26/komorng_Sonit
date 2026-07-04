"use client";

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FavoritesState {
  favoriteIds: string[];
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
}

/**
 * 🍱 Favorites Store (src/features/menu-browse/favorites-store.ts)
 * Logic for managing user's favorited items.
 */
export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favoriteIds: [],

      toggleFavorite: (productId: string) => {
        const current = get().favoriteIds;
        const isFav = current.includes(productId);
        
        if (isFav) {
          set({ favoriteIds: current.filter(id => id !== productId) });
        } else {
          set({ favoriteIds: [...current, productId] });
        }
      },

      isFavorite: (productId: string) => {
        return get().favoriteIds.includes(productId);
      },
    }),
    {
      name: 'xfos-favorites-storage',
    }
  )
);
