import { test, expect } from '@playwright/test';

test.describe('Empty State', () => {
  test('should render the empty lessons page on first visit', async ({ page }) => {
    await page.goto('/');

    // Wait for the main content to be visible
    await expect(page.locator('main')).toBeVisible();

    // Verify that the empty state message is visible
    await expect(page.getByText('Your Lesson Library is Empty')).toBeVisible();
    await expect(page.getByText('Add your first lesson video to start creating and organizing your bachata figures.')).toBeVisible();

    // Take a screenshot for visual regression testing
    await expect(page).toHaveScreenshot('empty-lessons-page.png');
  });
});
