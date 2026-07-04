import { env } from '@/config/env';

// Base fetch wrapper. The ONLY place that builds requests, sets headers,
// and handles auth/retries/tracing. Must be isomorphic — usable from both
// Server Components and client hooks. Never touch `window`, `document`, or
// `localStorage` here.
export type ApiInit = Omit<RequestInit, 'body'> & {
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined>;
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

export async function apiFetch<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { body, searchParams, headers, ...rest } = init;
  const isClient = typeof window !== 'undefined';
  const baseUrl = isClient ? window.location.origin : env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_API_BASE_URL");
  }
  const url = new URL(path, baseUrl);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const authToken = typeof window !== 'undefined' ? localStorage.getItem('authToken') : undefined;
  const mergedHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...headers,
  };
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'include',
    ...rest,
    headers: mergedHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(response.status, url.toString(), await response.text());
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
