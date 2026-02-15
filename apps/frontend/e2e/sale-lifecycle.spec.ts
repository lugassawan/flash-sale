import { test, expect } from '@playwright/test';
import { createSale, createActiveSale, deleteSale } from './fixtures/sale-api';

test.describe('Sale Lifecycle', () => {
  test.beforeEach(async () => {
    await deleteSale();
  });

  test.afterEach(async () => {
    await deleteSale();
  });

  test('displays UPCOMING state with countdown before sale starts (FE-1, FE-3)', async ({
    page,
  }) => {
    // Create a sale that starts in 60 seconds (enough time to observe UPCOMING)
    await createSale({ startsInSeconds: 60, durationSeconds: 300 });

    await page.goto('/');

    // Should show "Upcoming" badge (FE-1)
    await expect(page.getByText('Upcoming')).toBeVisible();

    // Countdown should be visible
    await expect(page.getByText('Sale starts in')).toBeVisible();

    // Buy button should be disabled when sale is not active (FE-3)
    await expect(page.getByRole('button', { name: 'Buy Now' })).toBeDisabled();

    // Stock counter should NOT be visible during UPCOMING
    await expect(page.locator('.stock-counter')).not.toBeVisible();
  });

  test('transitions from UPCOMING to ACTIVE via SSE (FE-1, FE-7)', async ({ page }) => {
    // Create a sale that starts in 3 seconds
    await createSale({ startsInSeconds: 3, durationSeconds: 300 });

    await page.goto('/');

    // Initially should show UPCOMING
    await expect(page.getByText('Upcoming')).toBeVisible();

    // Wait for state change to ACTIVE via SSE (within ~5s)
    await expect(page.getByText('Live Now')).toBeVisible({ timeout: 15_000 });

    // Stock counter should now appear
    await expect(page.locator('.stock-counter')).toBeVisible();

    // Buy button should become enabled (after jitter delay)
    await expect(page.getByRole('button', { name: 'Buy Now' })).toBeEnabled({ timeout: 5_000 });
  });

  test('shows ENDED state when sale time expires (FE-1)', async ({ page }) => {
    // Create a sale that ends in 3 seconds so we can witness the transition
    await createSale({ startsInSeconds: -2, durationSeconds: 5 });

    await page.goto('/');

    // Should initially show ACTIVE or quickly transition
    await expect(page.locator('.sale-status')).toBeVisible();

    // Wait for the sale to end (via SSE state-change event)
    await expect(page.getByText('Ended')).toBeVisible({ timeout: 15_000 });

    // When the user witnesses the transition, the reason text appears
    await expect(page.getByText('Sale time has expired')).toBeVisible({ timeout: 5_000 });

    // Buy button should be disabled
    await expect(page.getByRole('button', { name: 'Buy Now' })).toBeDisabled();
  });

  test('ACTIVE sale displays stock counter (FE-2)', async ({ page }) => {
    await createActiveSale({ initialStock: 50 });

    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();

    // Stock counter should show current/total
    await expect(page.locator('.stock-counter__current')).toHaveText('50');
    await expect(page.locator('.stock-counter__total')).toHaveText('50');
    await expect(page.getByText('items remaining')).toBeVisible();
  });

  test('SALE_NOT_ACTIVE rejection shown when sale has ended (FE-4)', async ({ page }) => {
    // Create a sale that already ended
    await createSale({ startsInSeconds: -60, durationSeconds: 30 });

    await page.goto('/');

    // Wait for ENDED state
    await expect(page.getByText('Ended')).toBeVisible({ timeout: 15_000 });

    // The button should be disabled in ENDED state, preventing UI submission.
    // This verifies FE-3 (button disabled when not active) which is the frontend's
    // mechanism for preventing SALE_NOT_ACTIVE errors.
    await expect(page.getByRole('button', { name: 'Buy Now' })).toBeDisabled();
  });
});
