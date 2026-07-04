import React from "react";
import { cn } from "@/lib/utils/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-xl text-[13px] font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] cursor-pointer",
          // Variants
          variant === "default" && "bg-primary text-white hover:opacity-90 shadow-sm",
          variant === "destructive" && "bg-rose-500 text-white hover:bg-rose-600 shadow-sm",
          variant === "outline" && "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
          variant === "secondary" && "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
          variant === "ghost" && "hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900",
          variant === "link" && "text-primary underline-offset-4 hover:underline",
          // Sizes
          size === "default" && "h-11 px-5",
          size === "sm" && "h-8 px-3 rounded-lg text-[12px]",
          size === "lg" && "h-12 px-6",
          size === "icon" && "h-10 w-10 rounded-xl",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
