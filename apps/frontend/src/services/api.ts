import type { ApiResponse, SaleStatus, PurchaseRecord } from '@/types/sale.types';

const BASE = '/api/v1';

export const DEFAULT_SKU = 'WIDGET-001';

async function parseResponse<T>(res: Response): Promise<ApiResponse<T>> {
  if (!res.ok) {
    try {
      return await res.json();
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
  }
  return res.json();
}

export async function fetchSaleStatus(sku: string): Promise<ApiResponse<SaleStatus>> {
  const res = await fetch(`${BASE}/sales?sku=${encodeURIComponent(sku)}`);
  return parseResponse(res);
}

export async function attemptPurchase(
  userId: string,
  sku: string,
): Promise<ApiResponse<PurchaseRecord>> {
  const res = await fetch(`${BASE}/purchases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
    },
    body: JSON.stringify({ sku }),
  });
  return parseResponse(res);
}

export async function fetchPurchaseStatus(
  userId: string,
  sku: string,
): Promise<ApiResponse<PurchaseRecord>> {
  const res = await fetch(`${BASE}/purchases?sku=${encodeURIComponent(sku)}`, {
    headers: { 'X-User-Id': userId },
  });
  return parseResponse(res);
}
