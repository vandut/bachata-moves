import { type Page, type Locator } from '@playwright/test';
import { GalleryOptionsSelectors } from './gallery-options';
import { ContextMenuSelectors } from './context-menu';

/**
 * A comprehensive collection of Playwright selectors for the Lessons Gallery page.
 * This class follows the Page Object Model pattern to make tests cleaner and more maintainable.
 */
export class LessonsPageSelectors {
  readonly page: Page;
  readonly options: GalleryOptionsSelectors;
  readonly contextMenu: ContextMenuSelectors;

  // --- Main View ---
  readonly view: Locator;
  readonly grid: Locator;
  readonly emptyState: Locator;
  readonly emptyStateAddButton: Locator;
  readonly loadingIndicator: Locator;

  // --- Top Navigation ---
  readonly pageTitle: Locator;
  readonly desktopTopNav: Locator;
  readonly mobileTopNav: Locator;

  // --- Modals ---
  readonly addLessonModal: {
    modal: Locator;
    title: Locator;
    fileInput: Locator;
    dateInput: Locator;
    descriptionInput: Locator;
    saveButton: Locator;
    cancelButton: Locator;
    closeButton: Locator;
  };
  readonly editLessonModal: {
      modal: Locator;
      title: Locator;
      editor: Locator;
      dateInput: Locator;
      saveButton: Locator;
  };
  readonly confirmDeleteModal: {
      modal: Locator;
      title: Locator;
      confirmButton: Locator;
      cancelButton: Locator;
  };

  constructor(page: Page) {
    this.page = page;
    this.options = new GalleryOptionsSelectors(page);
    this.contextMenu = new ContextMenuSelectors(page);

    // --- Main View ---
    this.view = page.locator('#lessons-gallery-view');
    this.grid = this.view.locator('[data-component="gallery-grid"]');
    this.emptyState = this.view.getByText('Your Lesson Library is Empty');
    this.emptyStateAddButton = this.view.getByRole('button', { name: 'Add First Lesson' });
    this.loadingIndicator = this.view.getByText('Loading Lessons...');

    // --- Top Navigation ---
    this.pageTitle = page.locator('[data-component="page-title"]');
    this.desktopTopNav = page.locator('#desktop-top-nav');
    this.mobileTopNav = page.locator('#mobile-top-nav');

    // --- Modals ---
    const addModalLocator = page.locator('[data-modal-name="AddLessonModal"]');
    this.addLessonModal = {
        modal: addModalLocator,
        title: addModalLocator.getByRole('heading', { name: 'Add New Lesson' }),
        fileInput: addModalLocator.locator('input[type="file"]'),
        dateInput: addModalLocator.locator('#lesson-date'),
        descriptionInput: addModalLocator.locator('#description'),
        saveButton: addModalLocator.locator('[data-action="modal-primary-action"]'),
        cancelButton: addModalLocator.locator('[data-action="modal-close"]'),
        // The mobile "back" button in the top nav acts as the close/cancel button.
        closeButton: page.locator('#mobile-top-nav [data-action="go-back"]')
    };

    const editModalLocator = page.locator('[data-modal-name="EditorScreen"]');
    this.editLessonModal = {
        modal: editModalLocator,
        title: editModalLocator.getByRole('heading', { name: /Edit:/ }),
        editor: editModalLocator.locator('[data-component="editor-screen"]'),
        dateInput: editModalLocator.locator('#uploadDate'),
        saveButton: editModalLocator.locator('[data-action="modal-primary-action"]')
    };

    const confirmDeleteLocator = page.locator('[data-modal-name="ConfirmDeleteModal"]');
    this.confirmDeleteModal = {
        modal: confirmDeleteLocator,
        title: confirmDeleteLocator.getByRole('heading', { name: 'Delete Lesson?' }),
        confirmButton: confirmDeleteLocator.locator('[data-action="confirm-delete"]'),
        cancelButton: confirmDeleteLocator.locator('[data-action="cancel-delete"]')
    };
  }

  // --- Dynamic Selectors for Cards & Context Menus ---

  /**
   * Gets the locator for a specific lesson card by its ID.
   * @param lessonId The unique ID of the lesson.
   */
  getCardById(lessonId: string): Locator {
    return this.page.locator(`[data-component="lesson-card"][data-item-id="${lessonId}"]`);
  }
  
  /**
   * Gets the locator for all visible lesson cards.
   */
  getAllCards(): Locator {
    return this.page.locator(`[data-component="lesson-card"]`);
  }
}
