# Gemini Development Guide for Bachata-Moves

This document provides guidelines for me, Gemini, when working on the `bachata-moves` project.

## 1. Overview

This is a React application built with TypeScript and Vite. It uses Material-UI (MUI) for components and styling, and `react-i18next` for internationalization. The project is configured as a Progressive Web App (PWA).

## 2. Development Workflow

You have a workflow where you replace the `src` directory with a version from AI Studio. While I understand this, my approach will be to make direct, targeted modifications to the files within the `src` directory and other project files as needed. This is a more precise and safer way to apply changes.

All modifications will strictly adhere to the existing coding styles, patterns, and conventions found in the project.

## 3. Architectural Contracts

The project contains `CONTRACT.md` files that define the architecture and coding standards. I will always adhere to these rules.

### Key Principles from Contracts:

*   **Technology Stack**: Use React, TypeScript, Vite, and Material-UI.
*   **Component-Based Architecture**: Build the UI with modular, reusable React components located in `src/components`.
*   **Separation of Concerns**:
    *   **`src/components`**: For UI components only.
    *   **`src/services`**: For business logic, data fetching, and manipulation. Services should be stateless and not contain UI code.
    *   **`src/api`**: For raw, direct communication with third-party APIs (like Google Drive). No business or UI logic here.
*   **State Management**: Use React's built-in state (`useState`) for local component state and React Context (`useContext`) for global state.
*   **Styling**: Use Material-UI for components and styling.
*   **Internationalization (i18n)**: Use the `react-i18next` library. Text visible to the user should be added to the i18n resource files.
*   **File and Folder Structure**: Maintain the existing structure as defined in the root `CONTRACT.md`.

## 4. Important Commands

I will use the following `npm` scripts to manage the project:

*   **`npm install`**: To install or update dependencies.
*   **`npm run dev`**: To start the development server.
*   **`npm run build`**: To type-check the code with `tsc` and create a production build.
*   **`npm run lint`**: To run ESLint for code quality and style checks.
*   **`npm run preview`**: To serve the production build locally for testing.
