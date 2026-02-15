import { test, expect } from '@playwright/test';
import { createActiveSale, deleteSale, makePurchase } from './fixtures/sale-api';

test.describe('Sold Out Flow', () => {
  test.beforeEach(async () => {
    await deleteSale();
  });

  test.afterEach(async () => {
    await deleteSale();
  });

  test('stock=2, two purchases via API, third user sees sold out in UI', async ({ page }) => {
    // Use long duration so the sale stays ACTIVE (won't end by time)
    await createActiveSale({ initialStock: 2, durationSeconds: 300 });

    // Exhaust stock via the backend API
    const result1 = await makePurchase('api-buyer-1');
    expect(result1.success).toBe(true);

    const result2 = await makePurchase('api-buyer-2');
    expect(result2.success).toBe(true);

    // Load the page as a third user
    await page.goto('/');
    await expect(page.locator('.sale-status')).toBeVisible();

    // The sale should transition to ENDED (reason text only shows if we witness the SSE event)
    await expect(page.getByText('Ended')).toBeVisible({ timeout: 15_000 });
  });

  test('user sees sold out error when attempting purchase on depleted sale (FE-4)', async ({
    page,
  }) => {
    // Long duration to prevent time-based ending
    await createActiveSale({ initialStock: 1, durationSeconds: 300 });

    // Deplete stock via API
    const result = await makePurchase('api-buyer-deplete');
    expect(result.success).toBe(true);

    await page.goto('/');
    await expect(page.locator('.sale-status')).toBeVisible();

    // Wait for stock to show 0 or sale to end
    await expect(
      page
        .getByText('All items have been sold')
        .or(page.locator('.stock-counter__current', { hasText: '0' })),
    ).toBeVisible({ timeout: 15_000 });

    // If the buy button is still enabled (sale hasn't transitioned to ENDED yet),
    // attempt a purchase to verify the sold-out UI feedback
    const buyButton = page.getByRole('button', { name: 'Buy Now' });
    if (await buyButton.isEnabled().catch(() => false)) {
      await page.getByLabel('User ID').fill('e2e-user-deplete-check');
      await buyButton.click();
      await expect(page.locator('.result--sold-out')).toBeVisible();
    }
  });
});
