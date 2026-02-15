import { test, expect } from '@playwright/test';
import { createActiveSale, deleteSale } from './fixtures/sale-api';

test.describe('Input Validation', () => {
  test.beforeEach(async () => {
    await deleteSale();
    await createActiveSale({ initialStock: 100 });
  });

  test.afterEach(async () => {
    await deleteSale();
  });

  test('empty user ID shows validation error without making API call (FE-5)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();

    // Wait for button to be enabled (after jitter)
    const buyButton = page.getByRole('button', { name: 'Buy Now' });
    await expect(buyButton).toBeEnabled({ timeout: 5_000 });

    // Intercept network to verify no API call is made
    let purchaseApiCalled = false;
    await page.route('**/api/v1/purchases', (route) => {
      if (route.request().method() === 'POST') {
        purchaseApiCalled = true;
      }
      return route.continue();
    });

    // Click buy with empty input
    await buyButton.click();

    // Should show validation error
    await expect(page.getByText('Please enter your user ID')).toBeVisible();

    // No API call should have been made
    expect(purchaseApiCalled).toBe(false);
  });

  test('whitespace-only user ID is rejected client-side (FE-5)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();

    const buyButton = page.getByRole('button', { name: 'Buy Now' });
    await expect(buyButton).toBeEnabled({ timeout: 5_000 });

    // Enter whitespace-only value
    await page.getByLabel('User ID').fill('   ');
    await buyButton.click();

    // Should show validation error
    await expect(page.getByText('Please enter your user ID')).toBeVisible();
  });

  test('validation error clears when user types (FE-5)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();

    const buyButton = page.getByRole('button', { name: 'Buy Now' });
    await expect(buyButton).toBeEnabled({ timeout: 5_000 });

    // Trigger validation error
    await buyButton.click();
    await expect(page.getByText('Please enter your user ID')).toBeVisible();

    // Start typing — error should clear
    await page.getByLabel('User ID').fill('a');
    await expect(page.getByText('Please enter your user ID')).not.toBeVisible();
  });
});
