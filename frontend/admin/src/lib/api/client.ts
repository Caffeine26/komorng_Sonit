import { config } from '@/config';
import { getSession } from 'next-auth/react';

// Base fetch wrapper. The ONLY place that builds requests, sets headers,
// and handles auth/retries/tracing. Must be isomorphic — usable from both
// Server Components and client hooks. Never touch `window`, `document`, or
// `localStorage` here.
export type ApiInit = Omit<RequestInit, 'body'> & {
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined>;
  token?: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Session token cache (client-side only) ─────────────────────────────────
// Avoid calling getSession() on every apiFetch — cache it for 60s.
let _cachedToken: string | null = null;
let _cacheExpiresAt = 0;

async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null; // SSR: skip cache
  const now = Date.now();
  if (_cachedToken && now < _cacheExpiresAt) return _cachedToken;
  const session = (await getSession()) as any;
  _cachedToken = session?.token ?? null;
  _cacheExpiresAt = now + 60_000; // cache for 60 seconds
  return _cachedToken;
}

export async function apiFetch<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { body, searchParams, headers, token, ...rest } = init;

  const resolvedToken = token ?? (await getToken());

  // [safari-rewrite-fix]
  // - Client-side: use a relative URL so Next.js rewrites proxy it (bypassing Safari cross-origin/mixed-content blocks).
  // - Server-side (SSR): use the absolute backend URL.
  let url: string | URL;
  if (typeof window !== 'undefined') {
    const u = new URL(path, window.location.origin);
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        if (v !== undefined) u.searchParams.set(k, String(v));
      }
    }
    url = u.pathname + u.search;
  } else {
    const base = config.adminApiUrl || 'http://127.0.0.1:4000';
    const u = new URL(path, base);
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        if (v !== undefined) u.searchParams.set(k, String(v));
      }
    }
    url = u;
  }

  const isFormData = body instanceof FormData;

  const response = await fetch(url, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      Accept: 'application/json',
      ...(resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}),
      ...headers,
    },
    body: isFormData ? (body as unknown as BodyInit) : (body === undefined ? undefined : JSON.stringify(body)),
  });

  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const clonedResponse = response.clone();
      try {
        const errorData = await clonedResponse.json();
        errorMessage = errorData.message || errorMessage;
      } catch {
        errorMessage = await response.text() || errorMessage;
      }
    } catch {
      // Fallback if cloning or text reading fails
    }
    throw new ApiError(response.status, url.toString(), errorMessage);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
