This file defines the top-level contract between an AI agent and the human user. Follow these rules:

1.  **Interfaces and Classes**:
    *   Interfaces should not have an `I` prefix (e.g., `DataService` instead of `IDataService`).
    *   Classes implementing an interface should have an `Impl` suffix or a prefix explaining the implementation (e.g., `DataServiceImpl` or `IndexDbDataService`).

2.  **File Naming**:
    *   File names should follow the main class or interface of that file if possible (e.g., a file containing the `DataService` interface should be named `DataService.ts`).
    *   Files containing a React hook should be named after the hook (e.g., `useMediaQuery.ts`).

3.  **File Deletion**: When files should be deleted, inform about all files to be deleted at the end of each response. List all files separately.

4.  **Application Versioning**:
    *   The application version is managed in `src/version.ts`.
    *   For every requested code change, you **must** increment the `APP_VERSION` string.
    *   Use Semantic Versioning (MAJOR.MINOR.PATCH):
        *   Increment **PATCH** for backward-compatible bug fixes.
        *   Increment **MINOR** for new, backward-compatible features.
        *   Increment **MAJOR** for breaking changes.
    *   This current change is a new feature, so the version has been incremented accordingly.
