import { useState, useCallback, useEffect, RefObject } from "react";
import { apiFetch } from "@/lib/api/client";
import { AuthUser } from "./useAuth";

export interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
}

interface UseTelegramAuthOptions {
    widgetContainerRef: RefObject<HTMLDivElement | null>;
    onSuccess: (user: AuthUser) => void;
    onError?: (error: string) => void;
    tenantSlug: string;
}

export function useTelegramAuth({
    widgetContainerRef,
    onSuccess,
    onError,
    tenantSlug,
}: UseTelegramAuthOptions) {
    const [isProcessing, setIsProcessing] = useState(false);

    // ── Handle Telegram callback ────────────────────────────────────────────────
    const handleTelegramAuth = useCallback(
        async (telegramData: TelegramUser) => {
            if (isProcessing) return;
            setIsProcessing(true);

            try {
                // Read sessionId from sessionStorage (set by QrSessionProvider)
                const qrSessionStr = sessionStorage.getItem('xfos_qr_session');
                const qrSession = qrSessionStr ? JSON.parse(qrSessionStr) : null;
                const sessionId = qrSession?.sessionId;

                const data = await apiFetch<{ user: AuthUser }>("/api/v1/storefront/auth/telegram", {
                    method: "POST",
                    credentials: "include", // Backend sets httpOnly cookies
                    body: { tenantSlug, telegramData, sessionId },
                });
                onSuccess(data.user);
            } catch (err: any) {
                const message = err?.message ?? "Telegram login failed. Please try again.";
                onError?.(message);
            } finally {
                setIsProcessing(false);
            }
        },
        [isProcessing, onSuccess, onError, tenantSlug]
    );

    // ── Inject Telegram widget script ───────────────────────────────────────────
    useEffect(() => {
        if (!widgetContainerRef.current) return;

        const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME;
        if (!BOT_NAME) {
            throw new Error("Missing environment variable: NEXT_PUBLIC_TELEGRAM_BOT_NAME");
        }

        // Expose the global callback Telegram widget will call
        (window as any).__onTelegramAuth = handleTelegramAuth;

        // Remove any previously injected script to avoid duplicates
        const existingScript = document.getElementById("telegram-login-script");
        if (existingScript) existingScript.remove();

        const script = document.createElement("script");
        script.id = "telegram-login-script";
        script.src = "https://telegram.org/js/telegram-widget.js?22";
        script.setAttribute("data-telegram-login", BOT_NAME);
        script.setAttribute("data-size", "large");
        script.setAttribute("data-onauth", "__onTelegramAuth(user)");
        script.setAttribute("data-request-access", "write");
        script.async = true;

        widgetContainerRef.current.appendChild(script);

        return () => {
            script.remove();
            delete (window as any).__onTelegramAuth;
        };
    }, [handleTelegramAuth, widgetContainerRef]);

    // ── Trigger the hidden Telegram widget ─────────────────────────────────────
    const triggerLogin = useCallback(() => {
        const iframe = widgetContainerRef.current?.querySelector("iframe");
        if (iframe) {
            // Post a message to the iframe to simulate a click
            iframe.contentWindow?.postMessage({ type: "open" }, "*");
            // Fallback: directly click the anchor Telegram renders
            const anchor = widgetContainerRef.current?.querySelector("a");
            anchor?.click();
        }
    }, [widgetContainerRef]);

    return { triggerLogin, isProcessing };
}
