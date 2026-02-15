import http from 'k6/http';
import { sleep } from 'k6';

const POLL_INTERVAL_SECONDS = 1;
const DEFAULT_TIMEOUT_SECONDS = 30;

/**
 * Create a flash sale via the admin API.
 *
 * @param {string} baseUrl  - API base URL (e.g. http://localhost:3000)
 * @param {string} adminKey - Admin API key
 * @param {Object} opts
 * @param {string} opts.sku          - Product SKU
 * @param {string} opts.productName  - Display name
 * @param {number} opts.initialStock - Stock count
 * @param {number} [opts.durationMinutes=30] - Sale duration
 * @returns {{ sku: string, state: string }}
 */
export function createSale(baseUrl, adminKey, opts) {
  const {
    sku,
    productName = 'Stress Test Product',
    initialStock = 100,
    durationMinutes = 30,
  } = opts;

  const now = new Date();
  const startTime = new Date(now.getTime() - 60_000).toISOString(); // 1 min ago
  const endTime = new Date(now.getTime() + durationMinutes * 60_000).toISOString();

  const payload = JSON.stringify({
    sku,
    productName,
    initialStock,
    startTime,
    endTime,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': adminKey,
    },
  };

  const res = http.post(`${baseUrl}/api/v1/products`, payload, params);

  if (res.status !== 201) {
    // Only retry on 409 Conflict (sale already exists)
    if (res.status === 409) {
      deleteSale(baseUrl, adminKey, sku);
      const retry = http.post(`${baseUrl}/api/v1/products`, payload, params);
      if (retry.status !== 201) {
        throw new Error(`Failed to create sale after retry: ${retry.status} ${retry.body}`);
      }
      return retry.json().data;
    }
    throw new Error(`Failed to create sale: ${res.status} ${res.body}`);
  }

  return res.json().data;
}

/**
 * Poll the public sale endpoint until the sale transitions to ACTIVE.
 *
 * @param {string} baseUrl
 * @param {string} sku
 * @param {number} [timeoutSeconds=30]
 * @returns {{ state: string, stock: number }}
 */
export function waitForActive(baseUrl, sku, timeoutSeconds) {
  const timeout = timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
  const deadline = Date.now() + timeout * 1000;

  while (Date.now() < deadline) {
    const res = http.get(`${baseUrl}/api/v1/sales?sku=${sku}`);

    if (res.status === 200) {
      const body = res.json();
      if (body.success && body.data.state === 'ACTIVE') {
        return body.data;
      }
    }

    sleep(POLL_INTERVAL_SECONDS);
  }

  throw new Error(`Sale ${sku} did not become ACTIVE within ${timeout} seconds`);
}

/**
 * Delete a sale via the admin API (cleanup).
 *
 * @param {string} baseUrl
 * @param {string} adminKey
 * @param {string} sku
 */
export function deleteSale(baseUrl, adminKey, sku) {
  http.del(`${baseUrl}/api/v1/products/${sku}`, null, {
    headers: { 'X-Admin-Key': adminKey },
  });
}

/**
 * Get product details via the admin API.
 *
 * @param {string} baseUrl
 * @param {string} adminKey
 * @param {string} sku
 * @returns {Object} Product details including totalPurchases and currentStock
 */
export function getProductDetails(baseUrl, adminKey, sku) {
  const res = http.get(`${baseUrl}/api/v1/products/${sku}`, {
    headers: { 'X-Admin-Key': adminKey },
  });

  if (res.status !== 200) {
    throw new Error(`Failed to get product details: ${res.status} ${res.body}`);
  }

  return res.json().data;
}
