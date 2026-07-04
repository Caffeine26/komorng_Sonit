import React from "react";
import { ShoppingCart } from "lucide-react";

interface RemoveItemDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export const RemoveItemDialog = ({ isOpen, onClose, onConfirm }: RemoveItemDialogProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/60 backdrop-blur-xl animate-ui-entry px-6">
            <div className="relative w-full max-w-[340px] rounded-[40px] bg-white shadow-[0_32px_64px_rgba(0,0,0,0.2)] flex flex-col items-center p-10 overflow-hidden">
                {/* Icon in light pink circle */}
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                    <ShoppingCart size={32} className="text-primary" strokeWidth={2.5} />
                </div>

                <h3 className="text-[24px] font-black text-zinc-900 tracking-tight mb-3">Remove item?</h3>
                <p className="text-[15px] text-zinc-500 font-medium text-center mb-10 leading-relaxed px-4">
                    Are you sure you want to remove this cart item?
                </p>

                <div className="flex w-full gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 h-[58px] rounded-full btn-primary font-bold text-[16px] active:scale-95 transition-all shadow-lg shadow-primary/20"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 h-[58px] rounded-full border-2 border-zinc-100 bg-white text-zinc-500 font-bold text-[16px] active:scale-95 transition-all"
                    >
                        Remove
                    </button>
                </div>
            </div>
        </div>
    );
};
