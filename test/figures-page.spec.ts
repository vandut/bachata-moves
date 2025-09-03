import { test, expect } from '@playwright/test';

test.describe('Figures Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#figures');
    await page.waitForSelector('main');
  });

  test('empty figures page', async ({ page }) => {
    await expect(page).toHaveScreenshot('empty-figures-page.png');
  });
});
