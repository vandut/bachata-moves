import { type Page, type Locator } from '@playwright/test';
import { GalleryOptionsSelectors } from './gallery-options';

/**
 * A comprehensive collection of Playwright selectors for the Figures Gallery page.
 */
export class FiguresPageSelectors {
  readonly page: Page;
  readonly options: GalleryOptionsSelectors;

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
  
  // --- Context Menu ---
  readonly contextMenu: Locator;

  // --- Modals ---
  readonly addFigureModal_step1: {
    modal: Locator;
    title: Locator;
    nextButton: Locator;
    cancelButton: Locator;
    closeButton: Locator;
  };

  readonly addFigureModal_step2_editor: {
    modal: Locator;
    title: Locator;
    editor: Locator;
    nameInput: Locator;
    descriptionInput: Locator;
    saveButton: Locator;
  };
  
  readonly editFigureModal: {
      modal: Locator;
      title: Locator;
      editor: Locator;
      nameInput: Locator;
      descriptionInput: Locator;
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

    // --- Main View ---
    this.view = page.locator('#figures-gallery-view');
    this.grid = this.view.locator('[data-component="gallery-grid"]');
    this.emptyState = this.view.getByText('No Figures Created Yet');
    this.emptyStateAddButton = this.view.getByRole('button', { name: 'Add First Figure' });
    this.loadingIndicator = this.view.getByText('Loading Figures...');

    // --- Top Navigation ---
    this.pageTitle = page.locator('[data-component="page-title"]');
    this.desktopTopNav = page.locator('#desktop-top-nav');
    this.mobileTopNav = page.locator('#mobile-top-nav');
    
    // --- Context Menu ---
    this.contextMenu = page.locator('[role="menu"]');

    // --- Modals ---
    const addModalStep1Locator = page.locator('[data-modal-name="AddFigureModal"]');
    this.addFigureModal_step1 = {
        modal: addModalStep1Locator,
        title: addModalStep1Locator.getByRole('heading', { name: 'Add New Figure: Select Lesson' }),
        nextButton: addModalStep1Locator.locator('[data-action="modal-primary-action"]'),
        cancelButton: addModalStep1Locator.locator('[data-action="modal-close"]'),
        closeButton: page.locator('#mobile-top-nav [data-action="go-back"]')
    };
    
    const editorModalLocator = page.locator('[data-modal-name="EditorScreen"]');
    this.addFigureModal_step2_editor = {
        modal: editorModalLocator,
        title: editorModalLocator.getByRole('heading', { name: 'Create New Figure' }),
        editor: editorModalLocator.locator('[data-component="editor-screen"]'),
        nameInput: editorModalLocator.locator('#name'),
        descriptionInput: editorModalLocator.locator('#description'),
        saveButton: editorModalLocator.locator('[data-action="modal-primary-action"]')
    };
    
    this.editFigureModal = {
        modal: editorModalLocator,
        title: editorModalLocator.getByRole('heading', { name: 'Edit Figure' }),
        editor: editorModalLocator.locator('[data-component="editor-screen"]'),
        nameInput: editorModalLocator.locator('#name'),
        descriptionInput: editorModalLocator.locator('#description'),
        saveButton: editorModalLocator.locator('[data-action="modal-primary-action"]')
    };

    const confirmDeleteLocator = page.locator('[data-modal-name="ConfirmDeleteModal"]');
    this.confirmDeleteModal = {
        modal: confirmDeleteLocator,
        title: confirmDeleteLocator.getByRole('heading', { name: 'Delete Figure?' }),
        confirmButton: confirmDeleteLocator.locator('[data-action="confirm-delete"]'),
        cancelButton: confirmDeleteLocator.locator('[data-action="cancel-delete"]')
    };
  }

  /**
   * Gets the locator for a specific figure card by its ID.
   * @param figureId The unique ID of the figure.
   */
  getCardById(figureId: string): Locator {
    return this.page.locator(`[data-component="figure-card"][data-item-id="${figureId}"]`);
  }
  
  /**
   * Gets the locator for all visible figure cards.
   */
  getAllCards(): Locator {
    return this.page.locator(`[data-component="figure-card"]`);
  }

  /**
   * Gets a specific item from the currently open context menu.
   * @param label The text label of the menu item.
   */
  getContextMenuItem(label: 'Open' | 'Category' | 'School' | 'Instructor' | 'Edit' | 'Remove'): Locator {
    return this.contextMenu.getByRole('menuitem', { name: label });
  }

  /**
   * Gets the lesson selection card in the "Add Figure" modal by the lesson's date.
   * @param dateString The formatted date string visible on the card (e.g., 'June 5, 2024').
   */
  getAddFigureLessonSelectionCardByDate(dateString: string): Locator {
      return this.addFigureModal_step1.modal.getByRole('button', { name: `Select lesson from ${dateString}` });
  }
}
