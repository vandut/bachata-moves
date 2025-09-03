import { test, expect } from '@playwright/test';

test('should render the empty state on first visit', async ({ page }) => {
  await page.goto('/#figures');

  await expect(page.locator('main')).toBeVisible();

  await expect(page).toHaveScreenshot('empty-figures-page.png');
});
