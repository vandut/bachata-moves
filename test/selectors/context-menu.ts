import { type Page, type Locator } from '@playwright/test';

/**
 * Selectors for the shared context menu component, used in both Lessons and Figures galleries.
 */
export class ContextMenuSelectors {
  readonly page: Page;

  // The main menu container. On desktop, this is a pop-up. On mobile, a bottom sheet.
  readonly container: Locator;
  
  constructor(page: Page) {
    this.page = page;

    // A robust selector that finds either the desktop context menu pop-up or the mobile bottom sheet.
    // Desktop: <div role="menu">...</div>
    // Mobile: <div class="... animate-slide-up-fast">...</div>
    // These elements are located anywhere on the page when visible, not necessarily as direct children of the body.
    this.container = page.locator('[role="menu"], .animate-slide-up-fast');
  }

  /**
   * Gets a specific action item from the currently open context menu.
   * This is designed to work for both desktop (menuitem role) and mobile (button role) implementations.
   * @param label The text label of the menu item (e.g., 'Edit', 'Remove').
   */
  getItem(label: 'Open' | 'Category' | 'School' | 'Instructor' | 'Edit' | 'Remove'): Locator {
    // The accessible name of a menu item can be a combination of icon names (e.g., "folder")
    // and the text label (e.g., "Category"), and another icon (e.g. "chevron_right"),
    // resulting in a full name like "folder Category chevron_right".
    // Using a regex that checks for the presence of the label as a substring
    // makes the selector robust against variations in surrounding icons.
    const nameRegExp = new RegExp(label);

    // This locator finds an element that has a role of either 'button' (mobile) or 'menuitem' (desktop)
    // and whose accessible name contains the provided label text.
    // FIX: Playwright's `getByRole` does not accept a regular expression for the role.
    // To select an element that could have one of two roles ('button' for mobile, 'menuitem' for desktop),
    // we create two separate locators and combine them with the `.or()` method. This achieves the desired
    // flexibility while adhering to the API's constraints.
    const buttonLocator = this.container.getByRole('button', { name: nameRegExp });
    const menuItemLocator = this.container.getByRole('menuitem', { name: nameRegExp });
    return buttonLocator.or(menuItemLocator);
  }
}
