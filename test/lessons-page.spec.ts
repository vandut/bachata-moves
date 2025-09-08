import { test, expect } from '@playwright/test';
import { LessonsPageSelectors } from './selectors/lessons';

test.describe('Lessons Page', () => {
  let selectors: LessonsPageSelectors;

  test.beforeEach(async ({ page }) => {
    selectors = new LessonsPageSelectors(page);
    await page.goto('/#lessons');
    await expect(selectors.view).toBeVisible();
  });

  test('should display the empty state correctly', async ({ page }) => {
    await expect(selectors.emptyState).toBeVisible();
    await expect(selectors.emptyStateAddButton).toBeVisible();
    await expect(page).toHaveScreenshot('empty-lessons-page.png');
  });

  test('should show "Add New Lesson" modal from empty state button', async ({ page }) => {
    await selectors.emptyStateAddButton.click();
    await expect(selectors.addLessonModal.modal).toBeVisible();
    await expect(selectors.addLessonModal.title).toBeVisible();
    await expect(page).toHaveScreenshot('add-first-lesson-modal.png');
  });
  
  test('should show "Add New Lesson" modal from gallery action bar', async ({ page }) => {
    await selectors.options.addNewButton.click();
    await expect(selectors.addLessonModal.modal).toBeVisible();
    await expect(selectors.addLessonModal.title).toBeVisible();
  });
});
