import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { createSale, waitForActive, deleteSale } from './helpers/setup-sale.js';
import { verifyInvariants, formatReport } from './helpers/verify-results.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_KEY = __ENV.ADMIN_API_KEY || 'dev-admin-key-12345678';
const SKU = __ENV.TEST_SKU || 'STRESS-LOAD-TEST';
const INITIAL_STOCK = parseInt(__ENV.INITIAL_STOCK || '100', 10);
const VUS = parseInt(__ENV.VUS || '1000', 10);

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

const purchaseSuccess = new Counter('purchase_success');
const purchaseSoldOut = new Counter('purchase_rejected_sold_out');
const purchaseAlreadyPurchased = new Counter('purchase_rejected_already_purchased');
const purchaseNotActive = new Counter('purchase_rejected_not_active');
const purchaseError = new Counter('purchase_error');
const httpErrors = new Counter('http_errors');

// ---------------------------------------------------------------------------
// k6 options
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    purchase_burst: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '120s',
    },
  },
  thresholds: {
    http_req_duration: ['p(50)<1000', 'p(95)<2000', 'p(99)<3000'],
    http_req_failed: ['rate<0.001'],
    purchase_success: [`count==${INITIAL_STOCK}`],
    purchase_error: ['count==0'],
    http_errors: ['count==0'],
  },
};

// ---------------------------------------------------------------------------
// Setup — runs once before all VUs
// ---------------------------------------------------------------------------

export function setup() {
  console.log(`\n[setup] Creating sale: SKU=${SKU}, stock=${INITIAL_STOCK}`);
  console.log(`[setup] Target: ${BASE_URL}`);
  console.log(`[setup] VUs: ${VUS}\n`);

  // Clean up any leftover sale from a previous run
  deleteSale(BASE_URL, ADMIN_KEY, SKU);

  // Create a new sale with start time in the past so it transitions to ACTIVE
  createSale(BASE_URL, ADMIN_KEY, {
    sku: SKU,
    productName: 'Stress Test Product',
    initialStock: INITIAL_STOCK,
  });

  // Wait for the state cron to transition the sale to ACTIVE
  const sale = waitForActive(BASE_URL, SKU, 30);
  console.log(`[setup] Sale is ACTIVE — stock: ${sale.stock}\n`);

  return {
    baseUrl: BASE_URL,
    adminKey: ADMIN_KEY,
    sku: SKU,
    initialStock: INITIAL_STOCK,
    vus: VUS,
  };
}

// ---------------------------------------------------------------------------
// Test — each VU executes once with a unique user ID
// ---------------------------------------------------------------------------

export default function (data) {
  const userId = `stress-user-${String(__VU).padStart(5, '0')}`;

  const res = http.post(`${data.baseUrl}/api/v1/purchases`, JSON.stringify({ sku: data.sku }), {
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
    },
    tags: { name: 'purchase' },
  });

  // Track HTTP-level errors
  const statusOk = check(res, {
    'status is 200': (r) => r.status === 200,
  });

  if (!statusOk) {
    httpErrors.add(1);
    purchaseError.add(1);
    return;
  }

  // Parse response and categorise outcome
  const body = res.json();

  if (body.success === true) {
    purchaseSuccess.add(1);
    check(body, {
      'has purchaseNo': (b) => typeof b.data.purchaseNo === 'string',
      'has purchasedAt': (b) => typeof b.data.purchasedAt === 'string',
    });
  } else {
    const code = body.error && body.error.code;

    switch (code) {
      case 'SOLD_OUT':
        purchaseSoldOut.add(1);
        break;
      case 'ALREADY_PURCHASED':
        purchaseAlreadyPurchased.add(1);
        break;
      case 'SALE_NOT_ACTIVE':
        purchaseNotActive.add(1);
        break;
      default:
        console.warn(`[vu=${__VU}] Unexpected rejection: ${code} — ${res.body}`);
        purchaseError.add(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Teardown — runs once after all VUs complete
// ---------------------------------------------------------------------------

export function teardown(data) {
  console.log('\n[teardown] Verifying invariants via admin API...\n');

  const result = verifyInvariants(data.baseUrl, data.adminKey, data.sku, data.initialStock);

  console.log(formatReport(result));

  if (!result.passed) {
    console.error('[teardown] INVARIANT VIOLATIONS DETECTED — see report above');
  }

  console.log(`[teardown] Final stock: ${result.summary.currentStock}`);
  console.log(`[teardown] Total purchases (DB): ${result.summary.totalPurchases}`);

  // Clean up test sale
  deleteSale(data.baseUrl, data.adminKey, data.sku);
}
