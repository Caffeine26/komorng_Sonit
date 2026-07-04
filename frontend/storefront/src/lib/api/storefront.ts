import {
  type StorefrontContextResponse,
  type StorefrontSubmitOrderRequest,
  type StorefrontSubmitOrderResponse,
  type StorefrontOrderStatusResponse,
  type StorefrontOrderHistoryResponse,
} from '@xfos/contracts-bff-storefront';
import { apiFetch } from './client';

// ──────────────────────────────────────────────────────────────────────────
// Storefront BFF client — the ONLY API surface this app talks to.
//
// See ADR-008. This file is the typed wrapper around /api/v1/storefront/*
// endpoints exposed by backend/api/src/modules/storefront/.
//
// Features must call THIS module from features/<x>/api.ts. Features must
// NEVER call apiFetch directly, and must NEVER reach into any other lib/api
// file (there are no other lib/api files in this app — only client.ts and
// this file).
// ──────────────────────────────────────────────────────────────────────────

export async function getStorefrontContext(slug: string): Promise<StorefrontContextResponse> {
  return apiFetch<StorefrontContextResponse>(`/api/v1/storefront/context/${encodeURIComponent(slug)}`);
}

export async function submitStorefrontOrder(
  input: StorefrontSubmitOrderRequest,
): Promise<StorefrontSubmitOrderResponse> {
  return apiFetch<StorefrontSubmitOrderResponse>('/api/v1/storefront/orders', {
    method: 'POST',
    body: input,
  });
}

export async function getStorefrontOrderStatus(
  token: string,
): Promise<StorefrontOrderStatusResponse> {
  return apiFetch<StorefrontOrderStatusResponse>(
    `/api/v1/storefront/orders/${encodeURIComponent(token)}`,
  );
}

export async function resolveQrSession(
  token: string,
): Promise<{ tenantId: string; sessionId: string; tableRef: string | null; tableId: string | null; qrContextId: string }> {
  return apiFetch<{ tenantId: string; sessionId: string; tableRef: string | null; tableId: string | null; qrContextId: string }>(
    `/api/v1/storefront/qr/resolve?token=${encodeURIComponent(token)}`
  );
}

export async function getCustomerOrderHistory(
  qrToken: string,
): Promise<StorefrontOrderHistoryResponse> {
  return apiFetch<StorefrontOrderHistoryResponse>(
    `/api/v1/storefront/orders/history?qr=${encodeURIComponent(qrToken)}`,
  );
}

export async function getCustomerIdentity(
  qrToken: string,
): Promise<{ customer: { fullName: string | null; phone: string | null; avatarUrl: string | null } | null }> {
  return apiFetch(
    `/api/v1/storefront/orders/customer-identity?qr=${encodeURIComponent(qrToken)}`,
  );
}
