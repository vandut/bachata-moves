import { test, expect } from '@playwright/test';
import { FiguresPageSelectors } from './selectors/figures';

test.describe('Figures Page', () => {
  let selectors: FiguresPageSelectors;

  test.beforeEach(async ({ page }) => {
    selectors = new FiguresPageSelectors(page);
    await page.goto('/#figures');
    await expect(selectors.view).toBeVisible();
  });

  test('should display the empty state correctly', async ({ page }) => {
    await expect(selectors.emptyState).toBeVisible();
    await expect(selectors.emptyStateAddButton).toBeVisible();
    await expect(page).toHaveScreenshot('empty-figures-page.png');
  });

  test('should show "Add New Figure" modal from empty state button', async ({ page }) => {
    await selectors.emptyStateAddButton.click();
    await expect(selectors.addFigureModal_step1.modal).toBeVisible();
    await expect(selectors.addFigureModal_step1.title).toBeVisible();
    await expect(page).toHaveScreenshot('add-first-figure-modal-step1.png');
  });
  
  test('should show "Add New Figure" modal from gallery action bar', async ({ page }) => {
    await selectors.options.addNewButton.click();
    await expect(selectors.addFigureModal_step1.modal).toBeVisible();
    await expect(selectors.addFigureModal_step1.title).toBeVisible();
  });
});
