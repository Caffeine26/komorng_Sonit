"use client";

import { useState, useEffect, useCallback } from "react";
import { useQrSessionContext } from "@/providers/qr-session-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
    id: string;
    email?: string | null;
    phone?: string | null;
    fullName?: string | null;
    avatarUrl?: string | null;
    roles: string[];
    tenantId: string | null;
    tenantStatus?: string | null;
    tenantSlug?: string | null;
}

interface AuthState {
    user: AuthUser | null;
    isLoggedIn: boolean;
    isLoading: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_API_BASE_URL");
}

const isClient = typeof window !== "undefined";
const API_BASE = isClient ? "/api/v1" : `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1`;

// Deduplicate in-flight refresh requests to prevent token rotation race conditions (Strict Mode / multiple hooks)
let refreshPromise: Promise<any> | null = null;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useAuth — storefront session hook
 *
 * On mount, calls POST /auth/refresh to rehydrate the session from
 * the httpOnly cookie the backend sets. Exposes:
 *   - user        → decoded user from the server response
 *   - isLoggedIn  → boolean derived from user !== null
 *   - isLoading   → true while the refresh call is in-flight
 *   - setUser     → called by TelegramLoginButton after a successful login
 *   - logout      → calls POST /auth/logout then clears local state
 */
export function useAuth() {
    const [state, setState] = useState<AuthState>({
        user: null,
        isLoggedIn: false,
        isLoading: true,
    });

    const { sessionId, isLoading: isQrLoading } = useQrSessionContext();

    // ── Rehydrate session on mount or when sessionId changes ───────────────────
    useEffect(() => {
        if (isQrLoading) return;

        // Always clear cached promise so this run uses the current sessionId
        refreshPromise = null;

        // Reset to loading while we re-auth
        setState(prev => ({ ...prev, isLoading: true }));

        let cancelled = false;

        async function rehydrate() {
            try {
                const promise = fetch(`${API_BASE}/storefront/auth/refresh`, {
                    method: "POST",
                    credentials: "include", // sends the httpOnly refresh_token cookie
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId })
                }).then(res => {
                    if (!res.ok) throw new Error("Unauthorized");
                    return res.json();
                });

                // Only cache it if nothing else started one in parallel
                if (!refreshPromise) refreshPromise = promise;

                const data = await promise;

                if (!cancelled && data?.user) {
                    setState({ user: data.user, isLoggedIn: true, isLoading: false });
                } else if (!cancelled) {
                    setState({ user: null, isLoggedIn: false, isLoading: false });
                }
            } catch {
                // Network error or 401 — stay logged out
                if (!cancelled) {
                    setState({ user: null, isLoggedIn: false, isLoading: false });
                }
            } finally {
                setTimeout(() => {
                    refreshPromise = null;
                }, 1000);
            }
        }

        rehydrate();

        return () => {
            cancelled = true;
        };
    }, [isQrLoading, sessionId]);

    // ── setUser — called after a successful Telegram login ─────────────────────
    const setUser = useCallback((user: AuthUser) => {
        setState({ user, isLoggedIn: true, isLoading: false });
    }, []);

    // ── logout ──────────────────────────────────────────────────────────────────
    const logout = useCallback(async () => {
        try {
            await fetch(`${API_BASE}/storefront/auth/logout`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId })
            });
        } catch {
            // Best-effort — clear local state regardless
        } finally {
            setState({ user: null, isLoggedIn: false, isLoading: false });
            if (typeof window !== "undefined") {
                window.location.reload();
            }
        }
    }, []);

    return {
        user: state.user,
        isLoggedIn: state.isLoggedIn,
        isLoading: state.isLoading,
        setUser,
        logout,
    };
}