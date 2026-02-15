import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { createSale, waitForActive, deleteSale } from './helpers/setup-sale.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_KEY = __ENV.ADMIN_API_KEY || 'dev-admin-key-12345678';
const SKU = __ENV.TEST_SKU || 'STRESS-POLL-TEST';
const INITIAL_STOCK = parseInt(__ENV.INITIAL_STOCK || '100', 10);

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

const pollSuccess = new Counter('poll_success');
const pollError = new Counter('poll_error');
const staleResponse = new Counter('stale_response');
const errorRate = new Rate('poll_error_rate');

// ---------------------------------------------------------------------------
// k6 options — ramp up to 1000 VUs polling at ~1 req/s each
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    status_polling: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 500 }, // Ramp up
        { duration: '30s', target: 1000 }, // Ramp to peak
        { duration: '60s', target: 1000 }, // Sustain peak
        { duration: '15s', target: 0 }, // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(50)<500', 'p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.001'],
    poll_error_rate: ['rate<0.001'],
    checks: ['rate>0.99'],
  },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setup() {
  console.log(`\n[setup] Creating sale for polling test: SKU=${SKU}`);

  deleteSale(BASE_URL, ADMIN_KEY, SKU);
  createSale(BASE_URL, ADMIN_KEY, {
    sku: SKU,
    productName: 'Status Polling Test Product',
    initialStock: INITIAL_STOCK,
  });

  const sale = waitForActive(BASE_URL, SKU, 30);
  console.log(`[setup] Sale is ACTIVE — stock: ${sale.stock}\n`);

  return { baseUrl: BASE_URL, sku: SKU };
}

// ---------------------------------------------------------------------------
// Test — each VU polls the sale endpoint repeatedly
// ---------------------------------------------------------------------------

export default function (data) {
  const res = http.get(`${data.baseUrl}/api/v1/sales?sku=${data.sku}`, {
    tags: { name: 'status_poll' },
  });

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'no server error': (r) => r.status < 500,
  });

  if (!ok) {
    pollError.add(1);
    errorRate.add(true);
    return;
  }

  errorRate.add(false);

  const body = res.json();

  check(body, {
    'response is successful': (b) => b.success === true,
    'has valid state': (b) => ['UPCOMING', 'ACTIVE', 'ENDED'].includes(b.data.state),
    'stock is non-negative': (b) => b.data.stock >= 0,
    'stock does not exceed initial': (b) => b.data.stock <= b.data.initialStock,
  });

  if (body.success) {
    pollSuccess.add(1);
  }

  // Simulate realistic polling interval (~1 req/s)
  sleep(1);
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function teardown() {
  console.log('\n[teardown] Status polling test complete');
  deleteSale(BASE_URL, ADMIN_KEY, SKU);
}
