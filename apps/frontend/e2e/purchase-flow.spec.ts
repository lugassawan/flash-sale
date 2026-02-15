import { test, expect } from '@playwright/test';
import { createActiveSale, deleteSale } from './fixtures/sale-api';

test.describe('Purchase Flow', () => {
  test.beforeEach(async () => {
    await deleteSale();
    await createActiveSale({ initialStock: 100 });
  });

  test.afterEach(async () => {
    await deleteSale();
  });

  test('happy path: view sale → enter user ID → buy → see confirmation', async ({ page }) => {
    await page.goto('/');

    // Wait for sale data to load and show the active badge
    await expect(page.getByText('Live Now')).toBeVisible();

    // Verify product name is displayed (FE-1)
    await expect(page.getByRole('heading', { name: 'E2E Test Widget' })).toBeVisible();

    // Stock counter should be visible with initial stock (FE-2)
    await expect(page.locator('.stock-counter__current')).toHaveText('100');

    // Enter user ID and submit purchase
    const userIdInput = page.getByLabel('User ID');
    await userIdInput.fill('e2e-user-purchase-flow');

    const buyButton = page.getByRole('button', { name: 'Buy Now' });
    await expect(buyButton).toBeEnabled();
    await buyButton.click();

    // Should show loading state then success (FE-4)
    await expect(page.getByText('Purchase confirmed')).toBeVisible();

    // Order number should be displayed
    await expect(page.locator('.result__mono')).toBeVisible();

    // Button should now say "Purchased" and be disabled (FE-6)
    await expect(page.getByRole('button', { name: 'Purchased' })).toBeDisabled();
  });

  test('purchase shows correct success feedback with order number', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Live Now')).toBeVisible();

    await page.getByLabel('User ID').fill('e2e-user-order-check');
    await page.getByRole('button', { name: 'Buy Now' }).click();

    // Verify the result section has the success styling
    const result = page.locator('.result--success');
    await expect(result).toBeVisible();

    // Verify order number format (should contain "Order" label)
    await expect(page.getByText('Order')).toBeVisible();
  });
});
