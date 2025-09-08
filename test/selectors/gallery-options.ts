import { type Page, type Locator } from '@playwright/test';

/**
 * Selectors for the shared gallery action bar components (add, filter, sort, etc.).
 * This class can be composed into other Page Object Models for different galleries.
 */
export class GalleryOptionsSelectors {
  readonly page: Page;

  // --- Action Bar and Buttons ---
  readonly actionBar: Locator;
  readonly addNewButton: Locator;
  readonly filterButton: Locator;
  readonly groupingButton: Locator;
  readonly sortButton: Locator;
  readonly muteButton: Locator;
  readonly syncStatusButton: Locator;

  // --- Active Dropdown Menu ---
  readonly activeDropdownMenu: Locator;

  constructor(page: Page) {
    this.page = page;

    // --- Action Bar ---
    this.actionBar = page.locator('#gallery-action-bar');
    this.addNewButton = this.actionBar.locator('[data-action="add-new"]');
    this.filterButton = this.actionBar.locator('[data-action="open-filters"]');
    this.groupingButton = this.actionBar.locator('[data-action="open-grouping"]');
    this.sortButton = this.actionBar.locator('[data-action="open-sort"]');
    this.muteButton = this.actionBar.getByRole('button', { name: /Mute|Unmute/ });
    this.syncStatusButton = this.actionBar.getByRole('button', { name: 'Sync with Google Drive' });

    // --- Active Dropdown Menu ---
    this.activeDropdownMenu = page.locator('[role="menu"]');
  }
  
  /**
   * Gets a specific item from a filtering, grouping, or sorting dropdown menu.
   * @param label The text label of the menu item (e.g., 'Newest', 'By Year').
   */
  getMenuItem(label: string): Locator {
    return this.activeDropdownMenu.getByRole('menuitem', { name: label });
  }
}
