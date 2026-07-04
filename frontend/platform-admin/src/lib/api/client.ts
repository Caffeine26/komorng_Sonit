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
  const url = new URL(path, env.NEXT_PUBLIC_API_BASE_URL);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const response = await fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(response.status, url.toString(), await response.text());
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
