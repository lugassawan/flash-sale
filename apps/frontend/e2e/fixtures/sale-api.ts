/**
 * Admin API helpers for E2E test setup and teardown.
 *
 * Uses the backend admin API directly (not through the frontend proxy)
 * to create, query, and reset sales deterministically.
 */

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.E2E_ADMIN_KEY ?? 'dev-admin-key-12345678';

export const TEST_SKU = 'WIDGET-001';

export interface CreateSaleParams {
  sku?: string;
  productName?: string;
  initialStock?: number;
  /** Seconds from now until the sale starts (default: 0 = immediate) */
  startsInSeconds?: number;
  /** Duration of the sale in seconds (default: 300) */
  durationSeconds?: number;
}

export interface SaleResponse {
  sku: string;
  productName: string;
  initialStock: number;
  startTime: string;
  endTime: string;
  state: string;
  createdAt: string;
}

/**
 * Create a sale via the admin API.
 * By default creates an immediately active sale with 100 stock.
 */
export async function createSale(params: CreateSaleParams = {}): Promise<SaleResponse> {
  const {
    sku = TEST_SKU,
    productName = 'E2E Test Widget',
    initialStock = 100,
    startsInSeconds = 0,
    durationSeconds = 300,
  } = params;

  const now = Date.now();
  const startTime = new Date(now + startsInSeconds * 1000).toISOString();
  const endTime = new Date(now + (startsInSeconds + durationSeconds) * 1000).toISOString();

  const res = await fetch(`${API_BASE}/api/v1/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_KEY,
    },
    body: JSON.stringify({ sku, productName, initialStock, startTime, endTime }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create sale (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Delete / reset a sale and all associated data.
 */
export async function deleteSale(sku: string = TEST_SKU): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/products/${encodeURIComponent(sku)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': ADMIN_KEY },
  });

  // 404 and 500 are tolerated — sale may not exist yet.
  // The backend returns 500 when deleting a non-existent product,
  // so we silently ignore all errors during cleanup.
  if (!res.ok && res.status !== 404 && res.status !== 500) {
    const body = await res.text();
    throw new Error(`Failed to delete sale (${res.status}): ${body}`);
  }
}

/**
 * Make a purchase via the backend API (bypassing the UI).
 * Useful for setting up sold-out scenarios or testing real-time updates.
 */
export async function makePurchase(
  userId: string,
  sku: string = TEST_SKU,
): Promise<{ success: boolean; data?: { purchaseNo: string }; error?: { code: string } }> {
  const res = await fetch(`${API_BASE}/api/v1/purchases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
    },
    body: JSON.stringify({ sku }),
  });

  return res.json();
}

/**
 * Get the admin product details (includes currentStock).
 * The API wraps responses in { success, data }, so we unwrap here.
 */
export async function getProductDetails(
  sku: string = TEST_SKU,
): Promise<{ currentStock: number; state: string }> {
  const res = await fetch(`${API_BASE}/api/v1/products/${encodeURIComponent(sku)}`, {
    headers: { 'X-Admin-Key': ADMIN_KEY },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get product (${res.status}): ${body}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

/**
 * Poll until the sale reaches ACTIVE state.
 * State transitions happen asynchronously via a cron, so after creating
 * a sale with a past startTime, we may need to wait briefly.
 */
export async function waitForSaleActive(
  sku: string = TEST_SKU,
  timeoutMs: number = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const details = await getProductDetails(sku);
    if (details.state === 'ACTIVE') return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Sale ${sku} did not become ACTIVE within ${timeoutMs}ms`);
}

/**
 * Create a sale and wait for it to become ACTIVE.
 * Convenience wrapper for tests that need to interact with an active sale via API.
 */
export async function createActiveSale(params: CreateSaleParams = {}): Promise<SaleResponse> {
  const sale = await createSale({ startsInSeconds: -5, ...params });
  await waitForSaleActive(params.sku);
  return sale;
}
