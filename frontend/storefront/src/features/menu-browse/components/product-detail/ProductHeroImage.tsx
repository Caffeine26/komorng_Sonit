import React from "react";
import Image from "next/image";
import { X, Share, Heart } from "lucide-react";
import { useFavoritesStore } from "@/features/menu-browse";
import { cn } from "@/lib/utils/cn";

interface ProductHeroImageProps {
  imageUrl?: string | null;
  images?: string[];
  name: string;
  onClose: () => void;
  productId: string;
}

export const ProductHeroImage = ({ imageUrl, images, name, onClose, productId }: ProductHeroImageProps) => {
  const { toggleFavorite, isFavorite } = useFavoritesStore();
  const favorited = isFavorite(productId);
  const [activeImageIdx, setActiveImageIdx] = React.useState(0);

  const displayImages = React.useMemo(() => {
    if (images && images.length > 0) return images;
    if (imageUrl) return [imageUrl];
    return ["https://placehold.co/800x600/png"];
  }, [imageUrl, images]);

  React.useEffect(() => {
    if (displayImages.length <= 1) return;
    const interval = setInterval(() => {
      setActiveImageIdx((prev) => (prev + 1) % displayImages.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [displayImages.length]);
  return (
    <div className="relative w-full h-[340px] md:h-full bg-white shrink-0">
      <Image 
        src={displayImages[activeImageIdx]} 
        alt={name} 
        fill 
        className="object-cover transition-opacity duration-500"
      />
      
      {/* Carousel Dots */}
      {displayImages.length > 1 && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
          {displayImages.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                idx === activeImageIdx
                  ? "bg-[var(--color-brand)] w-3"
                  : "bg-white/60"
              )}
            />
          ))}
        </div>
      )}
      {/* Seamless fade to page background */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#F5F5F7] to-transparent" />
      
      {/* Floating Action Buttons */}
      <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-4 right-4 flex justify-between items-center pointer-events-none">
        <button 
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md border border-white/50 flex items-center justify-center text-zinc-700 shadow-sm pointer-events-auto active:scale-90 transition-transform"
        >
          <X size={20} strokeWidth={2.5} />
        </button>
        <div className="flex gap-2 pointer-events-auto">
          <button className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md border border-white/50 flex items-center justify-center text-zinc-700 shadow-sm active:scale-90 transition-transform">
            <Share size={18} strokeWidth={2.5} />
          </button>
          <button 
            onClick={() => toggleFavorite(productId)}
            className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md border border-white/50 flex items-center justify-center text-zinc-700 shadow-sm active:scale-90 transition-transform"
          >
            <Heart 
              size={18} 
              strokeWidth={2.5} 
              className={cn(favorited ? "text-primary fill-primary" : "text-zinc-700")} 
            />
          </button>
        </div>
      </div>
    </div>
  );
};
