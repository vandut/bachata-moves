# E2E Testing Selector Contract

This document outlines the standard strategy for annotating UI components to ensure stable and readable selectors for end-to-end (E2E) testing with frameworks like Playwright. Adhering to this contract is mandatory for all new components and modifications to existing ones.

## Guiding Principles

1.  **Stability & Readability**: Selectors must be tied to a component's function and identity, not its implementation details like CSS classes, tag names, or DOM structure. This makes tests resilient to styling and code refactoring.
2.  **Accessibility as a Foundation**: Leverage standard HTML attributes like `role`, `aria-*`, and accessible names (e.g., `aria-label`). This improves both testability and accessibility. Playwright's role locators are the preferred method for locating elements.
3.  **Clarity Through Custom Attributes**: For testing-specific hooks, use custom `data-*` attributes. These are standard, valid HTML and provide clear, specific handles for automation that are unlikely to be changed for stylistic reasons.

## Selector Strategy

| Element Type | Attribute Strategy | Example | Playwright Locator Example |
| :--- | :--- | :--- | :--- |
| **Unique Views / Pages** | Use a unique `id` attribute on the main container. | `<div id="lessons-gallery-view">...</div>` | `page.locator('#lessons-gallery-view')` |
| **Reusable Components** | Use `data-component="ComponentName"` on the component's root element. | `<div data-component="LessonCard">...</div>` | `page.locator('[data-component="LessonCard"]')` |
| **Items in a List** | Add `data-item-id="{unique_id}"` to the component's root, alongside `data-component`. | `<div data-component="LessonCard" data-item-id="lesson-123">...</div>` | `page.locator('[data-item-id="lesson-123"]')` |
| **Interactive Elements (Buttons, Links, Inputs)** | **Primary**: Use `role` locators with accessible names. <br/> **Secondary**: For critical actions or when text may change (i18n), add a `data-action` attribute. | `<button data-action="save-lesson">Save</button>` | `page.getByRole('button', { name: 'Save' })` or `page.locator('[data-action="save-lesson"]')` |
| **Modals / Dialogs** | Use `role="dialog"` on the main modal container, and a unique `data-modal-name="ModalName"`. | `<div role="dialog" data-modal-name="AddLessonModal">...</div>` | `page.locator('[data-modal-name="AddLessonModal"]')` |
| **State Indicators** | Use standard `aria-*` attributes (`aria-expanded`, `aria-checked`, `aria-disabled`). | `<div role="button" aria-expanded="true">...</div>` | `page.getByRole('button', { expanded: true })` |

## Implementation Notes

*   **Do not use `data-testid`**: This attribute is often stripped from production builds. The `data-component` and `data-action` attributes are considered part of the component's contract and should remain in all environments.
*   **Be Consistent**: Apply these attributes uniformly across the application.
*   **Combine Selectors**: Playwright's power comes from chaining locators. For example, to find the "Edit" button on a specific lesson card: `page.locator('[data-item-id="lesson-123"]').getByRole('button', { name: 'Edit' })`.
