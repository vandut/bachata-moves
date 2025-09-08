import { type Page, type Locator } from '@playwright/test';

/**
 * A comprehensive collection of Playwright selectors for the Settings page.
 */
export class SettingsPageSelectors {
  readonly page: Page;

  // --- Main View & Navigation ---
  readonly view: Locator;
  readonly pageTitle: Locator;
  readonly desktopTopNav: Locator;
  readonly mobileTopNav: Locator;
  
  // --- Sections ---
  readonly languageSection: {
    heading: Locator;
    select: Locator;
  };
  
  readonly gallerySection: {
    heading: Locator;
    autoplayToggle: Locator;
  };
  
  readonly googleDriveSection: {
    heading: Locator;
    signInButton: Locator;
    signOutButton: Locator;
  };
  
  readonly dataManagementSection: {
    heading: Locator;
    exportButton: Locator;
    importButton: Locator;
    fileInput: Locator;
  };
  
  readonly importConfirmModal: {
    modal: Locator;
    title: Locator;
    confirmButton: Locator;
    cancelButton: Locator;
  };

  constructor(page: Page) {
    this.page = page;

    // --- Main View & Navigation ---
    this.view = page.locator('#settings-view');
    this.pageTitle = page.locator('[data-component="page-title"]');
    this.desktopTopNav = page.locator('#desktop-top-nav');
    this.mobileTopNav = page.locator('#mobile-top-nav');

    // --- Sections ---
    this.languageSection = {
        heading: this.view.getByRole('heading', { name: 'Language' }),
        select: this.view.locator('#language-select')
    };
    
    this.gallerySection = {
        heading: this.view.getByRole('heading', { name: 'Gallery' }),
        autoplayToggle: this.view.locator('[data-action="toggle-autoplay"]')
    };
    
    this.googleDriveSection = {
        heading: this.view.getByRole('heading', { name: 'Google Drive Sync' }),
        signInButton: this.view.locator('[data-action="google-signin"]'),
        signOutButton: this.view.locator('[data-action="google-signout"]')
    };
    
    this.dataManagementSection = {
        heading: this.view.getByRole('heading', { name: 'Data Management' }),
        exportButton: this.view.locator('[data-action="export-data"]'),
        importButton: this.view.locator('[data-action="import-data"]'),
        fileInput: this.view.locator('input[type="file"]')
    };
    
    const confirmImportLocator = page.locator('[data-modal-name="ConfirmDeleteModal"]');
    this.importConfirmModal = {
        modal: confirmImportLocator,
        title: confirmImportLocator.getByRole('heading', { name: 'Import and Overwrite Data?' }),
        confirmButton: confirmImportLocator.locator('[data-action="confirm-delete"]'),
        cancelButton: confirmImportLocator.locator('[data-action="cancel-delete"]')
    };
  }
}
