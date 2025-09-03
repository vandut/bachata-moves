import { test, expect } from '@playwright/test';

test.describe('Figures Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#figures');
    await page.waitForSelector('main');
  });

  test('empty figures page', async ({ page }) => {
    await expect(page).toHaveScreenshot('empty-figures-page.png');
  });

  test('should show add figure modal when no lessons available', async ({ page }) => {
    await page.getByLabel('Add').click();

    await expect(page.getByRole('heading', { name: 'Add New Figure: Select Lesson'})).toBeVisible();
    await expect(page.getByText('No lessons found.')).toBeVisible();

    await expect(page).toHaveScreenshot('add-first-figure-no-lessons-modal.png');
  });
});
