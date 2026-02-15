import { test, expect } from '@playwright/test';
import { createActiveSale, deleteSale, makePurchase } from './fixtures/sale-api';

test.describe('Real-Time Updates', () => {
  test.beforeEach(async () => {
    await deleteSale();
    await createActiveSale({ initialStock: 10 });
  });

  test.afterEach(async () => {
    await deleteSale();
  });

  test('stock counter decrements in real-time when purchase made via API (FE-2, FE-7)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();

    // Verify initial stock
    await expect(page.locator('.stock-counter__current')).toHaveText('10');

    // Make a purchase via the backend API (simulating another user)
    await makePurchase('api-realtime-buyer-1');

    // Stock should update in the UI without page refresh (via SSE)
    await expect(page.locator('.stock-counter__current')).toHaveText('9', { timeout: 10_000 });
  });

  test('multiple stock updates reflected in sequence (FE-7)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();
    await expect(page.locator('.stock-counter__current')).toHaveText('10');

    // Make several purchases via API
    await makePurchase('api-seq-buyer-1');
    await expect(page.locator('.stock-counter__current')).not.toHaveText('10', {
      timeout: 10_000,
    });

    await makePurchase('api-seq-buyer-2');

    // Stock should eventually reach 8
    await expect(page.locator('.stock-counter__current')).toHaveText('8', { timeout: 10_000 });
  });

  test('SSE connection indicator shows "Live" when connected', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();

    // Connection indicator should show "Live" (use exact match to avoid "Live Now" badge)
    await expect(page.locator('.app__connection')).toContainText('Live');
    await expect(page.locator('.app__connection-dot--connected')).toBeVisible();
  });
});
