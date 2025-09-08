# E2E Testing Commenting Contract

This document outlines the standard for adding comments to E2E test files, including selector files (Page Object Models) and spec files.

## Guiding Principle

Code should be as self-documenting as possible. Well-named variables, functions, and classes are preferred over explanatory comments.

## Rules

1.  **Avoid Redundant Comments**: Do not add comments that merely restate what the code is doing.

    *   **Incorrect**:
        ```typescript
        // Click the login button
        await page.getByRole('button', { name: 'Login' }).click();
        ```

    *   **Correct**:
        ```typescript
        await page.getByRole('button', { name: 'Login' }).click();
        ```

2.  **Use Comments for "Why," not "What"**: Comments are valuable when they explain the reasoning behind a piece of code that might not be immediately obvious. This is particularly useful for explaining workarounds, business logic, or complex assertions.

    *   **Example**:
        ```typescript
        // This test simulates a user with an expired session.
        // We must clear local storage before navigating to the page.
        await page.evaluate(() => localStorage.clear());
        ```

3.  **Use Section Dividers**: Comments are encouraged for visually structuring files, especially larger selector files. This improves readability and navigation.

    *   **Example**:
        ```typescript
        // --- Main View ---
        readonly view: Locator;
        readonly grid: Locator;

        // --- Modals ---
        readonly addLessonModal: { ... };
        ```

4.  **JSDoc for Public APIs**: Public methods and classes, especially in shared selector files, should have clear JSDoc comments explaining their purpose, parameters, and return values.

    *   **Example**:
        ```typescript
        /**
         * Gets the locator for a specific lesson card by its ID.
         * @param lessonId The unique ID of the lesson.
         */
        getCardById(lessonId: string): Locator { ... }
        ```
