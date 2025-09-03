import { test, expect } from '@playwright/test';

test.describe('Lessons Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#lessons');
    await page.waitForSelector('main');
  });

  test('empty lessons page', async ({ page }) => {
    await expect(page).toHaveScreenshot('empty-lessons-page.png');
  });
});
