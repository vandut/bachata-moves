import { test, expect } from '@playwright/test';

test('should render the on first visit', async ({ page }) => {
  await page.goto('/#settings');

  await expect(page.locator('main')).toBeVisible();

  await expect(page).toHaveScreenshot('initial-settings-page.png');
});
