import { test, expect } from '@playwright/test';

test.describe('Lessons Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#lessons');
    await page.waitForSelector('main');
  });

  test('empty lessons page', async ({ page }) => {
    await expect(page).toHaveScreenshot('empty-lessons-page.png');
  });

  test('should show add first lesson modal', async ({ page }) => {
    await page.getByLabel('Add').click();

    await expect(page.getByRole('heading', { name: 'Add New Lesson' })).toBeVisible();

    await expect(page).toHaveScreenshot('add-first-lesson-modal.png');
  });
});
