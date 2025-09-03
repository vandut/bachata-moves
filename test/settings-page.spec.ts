import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#settings');
    await page.waitForSelector('main');
  });

  test('initial settings page', async ({ page }) => {
    await expect(page).toHaveScreenshot('initial-settings-page.png');
  });
});
