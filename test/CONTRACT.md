# Contract for Integration and E2E Tests

## 1. Purpose

This document outlines the requirements for all end-to-end (E2E) and integration tests in this directory. The primary goal is to ensure the application provides a consistent and correct user experience across different form factors.

## 2. Multi-Device Testing is Mandatory

All tests that validate UI behavior or appearance **must** be executed against both **desktop** and **mobile** viewports.

### Implementation

- The Playwright configuration (`playwright.config.ts`) is set up to run every test file against two projects: a "Desktop" project and a "Mobile" project.
- Screenshot snapshots will be generated and compared for each viewport independently. This means a single test will have at least two snapshots (e.g., `my-test-desktop.png` and `my-test-mobile.png`).
- Tests should be written to be environment-agnostic and should not contain logic specific to a single form factor unless absolutely necessary.

This approach ensures that our application's responsiveness is automatically verified with every test run.
