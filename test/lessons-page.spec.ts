import { test, expect } from '@playwright/test';
import { LessonsPageSelectors } from './selectors/lessons';

test.describe('Lessons Page', () => {
  let selectors: LessonsPageSelectors;

  test.beforeEach(async ({ page }) => {
    selectors = new LessonsPageSelectors(page);
    await page.goto('/#lessons');
    await expect(selectors.view).toBeVisible();
  });

  test('should upload a new lesson, see it, and then delete it', async ({ page }) => {
    // 0. Initial state
    await expect(page).toHaveScreenshot('lesson-upload-delete-01-empty-gallery-before-upload.png');

    // 1. Open the "Add New Lesson" modal
    await selectors.options.addNewButton.click();
    await expect(selectors.addLessonModal.modal).toBeVisible();
    await selectors.addLessonModal.dateInput.fill('2025-09-08');
    await expect(page).toHaveScreenshot('lesson-upload-delete-02-add-lesson-modal-opened.png');

    // 2. Fill out the form
    await selectors.addLessonModal.fileInput.setInputFiles('video/clip.mp4');
    await expect(page).toHaveScreenshot('lesson-upload-delete-03-add-lesson-modal-filled.png');

    // 3. Save the new lesson
    await selectors.addLessonModal.saveButton.click();

    // 4. Verify the modal is closed and card is in gallery
    await expect(selectors.addLessonModal.modal).not.toBeVisible();
    const newCard = selectors.getAllCards().first();
    await expect(newCard).toBeVisible();
    await expect(page).toHaveScreenshot('lesson-upload-delete-04-gallery-with-new-lesson.png');

    // 5. Verify the date on the new card
    await expect(newCard.getByText('September 8, 2025')).toBeVisible();

    // --- DELETION STEPS ---

    // 6. Right-click the card to open the context menu
    await newCard.click({ button: 'right' });
    await expect(selectors.contextMenu.container).toBeVisible();

    // On desktop, move mouse away from card to stop video hover effect, ensuring a stable screenshot.
    // This is not needed on mobile as there's no hover, and the menu overlay covers the page title.
    const isDesktop = await page.locator('#desktop-drawer').isVisible();
    if (isDesktop) {
      await selectors.pageTitle.hover();
    }

    await expect(page).toHaveScreenshot('lesson-upload-delete-05-lesson-context-menu-open.png');

    // 7. Click the "Remove" option
    await selectors.contextMenu.getItem('Remove').click();
    
    // 8. Verify the confirm delete modal appears
    await expect(selectors.confirmDeleteModal.modal).toBeVisible();
    await expect(selectors.confirmDeleteModal.title).toBeVisible();
    await expect(page).toHaveScreenshot('lesson-upload-delete-06-lesson-confirm-delete-modal.png');

    // 9. Confirm deletion
    await selectors.confirmDeleteModal.confirmButton.click();

    // 10. Verify the modal is closed and the gallery is empty again
    await expect(selectors.confirmDeleteModal.modal).not.toBeVisible();
    await expect(selectors.getAllCards()).toHaveCount(0);
    await expect(selectors.emptyState).toBeVisible();
    await expect(page).toHaveScreenshot('lesson-upload-delete-07-gallery-empty-after-delete.png');
  });
});
