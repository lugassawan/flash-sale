import { test, expect } from '@playwright/test';
import { createActiveSale, deleteSale, makePurchase } from './fixtures/sale-api';

test.describe('Duplicate Purchase Prevention', () => {
  test.beforeEach(async () => {
    await deleteSale();
    await createActiveSale({ initialStock: 100 });
  });

  test.afterEach(async () => {
    await deleteSale();
  });

  test('after purchase, page reload restores purchased state (FE-6)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();

    // Make a purchase
    await page.getByLabel('User ID').fill('e2e-user-duplicate');
    const buyButton = page.getByRole('button', { name: 'Buy Now' });
    await expect(buyButton).toBeEnabled({ timeout: 5_000 });
    await buyButton.click();

    // Wait for success confirmation
    await expect(page.getByText('Purchase confirmed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Purchased' })).toBeDisabled();

    // Verify session storage has the user ID before reload
    const storedUserId = await page.evaluate(() => sessionStorage.getItem('flash-sale-user-id'));
    expect(storedUserId).toBe('e2e-user-duplicate');

    // Reload the page — session storage persists within the same browser context
    await page.reload();

    // Wait for the sale data to load first
    await expect(page.getByText('Live Now')).toBeVisible();

    // Wait for the async purchase status check to complete.
    // The hook reads sessionStorage and calls GET /purchases to restore state.
    await expect(page.getByRole('button', { name: 'Purchased' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Purchased' })).toBeDisabled();
  });

  test('input and button disabled after successful purchase (FE-6)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();

    // First purchase
    await page.getByLabel('User ID').fill('e2e-user-post-purchase');
    const buyButton = page.getByRole('button', { name: 'Buy Now' });
    await expect(buyButton).toBeEnabled({ timeout: 5_000 });
    await buyButton.click();
    await expect(page.getByText('Purchase confirmed')).toBeVisible();

    // The user input should be disabled after successful purchase
    await expect(page.getByLabel('User ID')).toBeDisabled();
    // Button should show "Purchased" and be disabled
    await expect(page.getByRole('button', { name: 'Purchased' })).toBeDisabled();
  });

  test('already-purchased user sees ALREADY_PURCHASED rejection (FE-4)', async ({ page }) => {
    // Make a purchase via API first
    await makePurchase('e2e-user-already-bought');

    // Wait briefly to avoid triggering rate limiter
    await new Promise((r) => setTimeout(r, 1500));

    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();

    // Try to purchase with the same user ID through the UI
    await page.getByLabel('User ID').fill('e2e-user-already-bought');
    const buyButton = page.getByRole('button', { name: 'Buy Now' });
    await expect(buyButton).toBeEnabled({ timeout: 5_000 });
    await buyButton.click();

    // Should see the "already purchased" rejection (FE-4: distinct feedback)
    await expect(page.locator('.result--already-purchased')).toBeVisible();
  });
});
