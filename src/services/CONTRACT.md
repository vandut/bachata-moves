This file defines a contract for managing high-level services within this directory. Follow these rules:

1.  **Single Responsibility**: Each service should have a single, well-defined responsibility (e.g., `GoogleDriveService` for Drive interactions, `SyncQueueService` for managing sync tasks).

2.  **Interface-Driven**: Each service should have a clear TypeScript interface defining its public API.

3.  **File Naming**: The file name should match the primary interface or class (e.g., `GoogleDriveService.ts`).

4.  **Domain Logic**: Services are the primary location for application business logic. They orchestrate operations between the UI, data layer (`DataService`), and external APIs (`api` directory).

5.  **Dependency Management**: Services must use dependency injection (preferably constructor injection) to receive their dependencies (e.g., `DataService`, API wrappers). They should not instantiate their own dependencies. This improves testability and decouples components. Services should not directly manipulate the DOM or contain UI-specific logic.

6.  **Singleton Pattern**: Services that manage state or represent a single connection (like `GoogleDriveService`) should be implemented as singletons to be shared across the application.
