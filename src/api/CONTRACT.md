This file defines a contract for managing external API integrations within this directory. Follow these rules:

1.  **One API per File**: Each external API integration should be contained within a single TypeScript file (e.g., `googledrive.ts`, `dropbox.ts`).

2.  **Self-Contained Modules**: Each file must be a self-contained module that includes:
    *   **Interface**: A clearly defined TypeScript interface for the API class (e.g., `IGoogleDriveApi`).
    *   **Types**: All related TypeScript types and interfaces required by the API (e.g., `DriveFile`).
    *   **Implementation**: The concrete class that implements the defined interface.

3.  **Structure**:
    *   Start with the interface and type definitions under a "--- Types and Interface ---" heading.
    *   Follow with the class implementation under an "--- Implementation ---" heading.
    *   Export all necessary interfaces, types, and the class.

4.  **No Business Logic**: API wrappers must be generic and contain no application-specific business logic (e.g., no hardcoded folder names like 'lessons'). They should be reusable.

5.  **Clarity over Comments**:
    *   Methods must have clear, self-documenting names. The purpose of a method should be understandable from its name, parameters, and return type alone.
    *   Avoid implementation comments. The code should be clean and readable enough to not require them.
    *   The only permitted comments are section headings (like "--- Types and Interface ---"), "Fix:", and "TODO:".
