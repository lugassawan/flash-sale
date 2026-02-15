import { getProductDetails } from './setup-sale.js';

/**
 * Verify post-test invariants by querying the admin API.
 *
 * Checks only database-backed invariants (the source of truth).
 * k6 thresholds handle success-count validation during the test run.
 *
 * @param {string} baseUrl
 * @param {string} adminKey
 * @param {string} sku
 * @param {number} initialStock
 * @returns {{ passed: boolean, violations: string[], summary: Object }}
 */
export function verifyInvariants(baseUrl, adminKey, sku, initialStock) {
  const violations = [];

  // Fetch final state from admin API (source of truth)
  const product = getProductDetails(baseUrl, adminKey, sku);

  const summary = {
    initialStock,
    currentStock: product.currentStock,
    totalPurchases: product.totalPurchases,
  };

  // Invariant 1: No overselling — total purchases must not exceed initial stock
  if (product.totalPurchases > initialStock) {
    violations.push(
      `OVERSELL: totalPurchases (${product.totalPurchases}) > initialStock (${initialStock})`,
    );
  }

  // Invariant 2: Stock must never go negative
  if (product.currentStock < 0) {
    violations.push(`NEGATIVE_STOCK: currentStock is ${product.currentStock}`);
  }

  // Invariant 3: Purchases + remaining stock should equal initial stock
  if (product.totalPurchases + product.currentStock !== initialStock) {
    violations.push(
      `STOCK_MISMATCH: totalPurchases (${product.totalPurchases}) + currentStock (${product.currentStock}) != initialStock (${initialStock})`,
    );
  }

  return {
    passed: violations.length === 0,
    violations,
    summary,
  };
}

/**
 * Format verification results as a human-readable report.
 *
 * @param {{ passed: boolean, violations: string[], summary: Object }} result
 * @returns {string}
 */
export function formatReport(result) {
  const lines = [
    '',
    '╔══════════════════════════════════════════════╗',
    '║        STRESS TEST INVARIANT REPORT          ║',
    '╚══════════════════════════════════════════════╝',
    '',
    `  Initial Stock:       ${result.summary.initialStock}`,
    `  Current Stock:       ${result.summary.currentStock}`,
    `  Total Purchases:     ${result.summary.totalPurchases}`,
    '',
  ];

  if (result.passed) {
    lines.push('  Result: ALL INVARIANTS PASSED');
  } else {
    lines.push('  Result: INVARIANT VIOLATIONS DETECTED');
    lines.push('');
    for (const v of result.violations) {
      lines.push(`    - ${v}`);
    }
  }

  lines.push('');
  lines.push('══════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}
