import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { createSale, waitForActive, deleteSale } from './helpers/setup-sale.js';
import { verifyInvariants, formatReport } from './helpers/verify-results.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_KEY = __ENV.ADMIN_API_KEY || 'dev-admin-key-12345678';
const SKU = __ENV.TEST_SKU || 'STRESS-MIXED-TEST';
const INITIAL_STOCK = parseInt(__ENV.INITIAL_STOCK || '100', 10);
const PURCHASE_VUS = parseInt(__ENV.PURCHASE_VUS || '1000', 10);
const POLL_VUS = parseInt(__ENV.POLL_VUS || '500', 10);

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

const purchaseSuccess = new Counter('purchase_success');
const purchaseSoldOut = new Counter('purchase_rejected_sold_out');
const purchaseAlreadyPurchased = new Counter('purchase_rejected_already_purchased');
const purchaseNotActive = new Counter('purchase_rejected_not_active');
const purchaseError = new Counter('purchase_error');
const pollSuccess = new Counter('poll_success');
const pollError = new Counter('poll_error');
const httpErrors = new Counter('http_errors');
const purchaseErrorRate = new Rate('purchase_error_rate');

// ---------------------------------------------------------------------------
// k6 options — concurrent read and write scenarios
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    // Read path: status pollers hammering the GET endpoint
    status_pollers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: POLL_VUS }, // Ramp up pollers
        { duration: '60s', target: POLL_VUS }, // Sustain during purchases
        { duration: '10s', target: 0 }, // Ramp down
      ],
      exec: 'pollStatus',
      gracefulRampDown: '5s',
    },

    // Write path: purchasers firing simultaneously
    purchasers: {
      executor: 'per-vu-iterations',
      vus: PURCHASE_VUS,
      iterations: 1,
      maxDuration: '120s',
      startTime: '10s', // Start after pollers have ramped up
      exec: 'attemptPurchase',
    },
  },
  thresholds: {
    http_req_duration: ['p(50)<1000', 'p(95)<2000'],
    http_req_failed: ['rate<0.001'],
    purchase_success: [`count==${INITIAL_STOCK}`],
    purchase_error_rate: ['rate<0.001'],
    http_errors: ['count==0'],
  },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setup() {
  console.log(`\n[setup] Mixed workload test`);
  console.log(`[setup] SKU=${SKU}, stock=${INITIAL_STOCK}`);
  console.log(`[setup] Purchase VUs: ${PURCHASE_VUS}, Poll VUs: ${POLL_VUS}\n`);

  deleteSale(BASE_URL, ADMIN_KEY, SKU);
  createSale(BASE_URL, ADMIN_KEY, {
    sku: SKU,
    productName: 'Mixed Workload Test Product',
    initialStock: INITIAL_STOCK,
  });

  const sale = waitForActive(BASE_URL, SKU, 30);
  console.log(`[setup] Sale is ACTIVE — stock: ${sale.stock}\n`);

  return {
    baseUrl: BASE_URL,
    adminKey: ADMIN_KEY,
    sku: SKU,
    initialStock: INITIAL_STOCK,
    purchaseVUs: PURCHASE_VUS,
  };
}

// ---------------------------------------------------------------------------
// Scenario: Poll status (read path)
// ---------------------------------------------------------------------------

export function pollStatus(data) {
  const res = http.get(`${data.baseUrl}/api/v1/sales?sku=${data.sku}`, {
    tags: { name: 'mixed_poll' },
  });

  const ok = check(res, {
    'poll: status is 200': (r) => r.status === 200,
    'poll: no server error': (r) => r.status < 500,
  });

  if (ok) {
    pollSuccess.add(1);

    const body = res.json();
    check(body, {
      'poll: stock non-negative': (b) => b.data.stock >= 0,
    });
  } else {
    pollError.add(1);
  }

  sleep(1);
}

// ---------------------------------------------------------------------------
// Scenario: Attempt purchase (write path)
// ---------------------------------------------------------------------------

export function attemptPurchase(data) {
  const userId = `mixed-user-${String(__VU).padStart(5, '0')}`;

  const res = http.post(`${data.baseUrl}/api/v1/purchases`, JSON.stringify({ sku: data.sku }), {
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
    },
    tags: { name: 'mixed_purchase' },
  });

  const statusOk = check(res, {
    'purchase: status is 200': (r) => r.status === 200,
  });

  if (!statusOk) {
    httpErrors.add(1);
    purchaseError.add(1);
    purchaseErrorRate.add(true);
    return;
  }

  purchaseErrorRate.add(false);
  const body = res.json();

  if (body.success === true) {
    purchaseSuccess.add(1);
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
        purchaseError.add(1);
        purchaseErrorRate.add(true);
    }
  }
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function teardown(data) {
  console.log('\n[teardown] Verifying mixed workload invariants...\n');

  const result = verifyInvariants(data.baseUrl, data.adminKey, data.sku, data.initialStock);

  console.log(formatReport(result));

  if (!result.passed) {
    console.error('[teardown] INVARIANT VIOLATIONS DETECTED');
  }

  // Clean up test sale
  deleteSale(data.baseUrl, data.adminKey, data.sku);
}
