import { dataService, DataService } from './DataService';
import { localDatabaseService, LocalDatabaseService } from './LocalDatabaseService';
import { syncQueueService, SyncQueueService } from './SyncQueueService';
import { googleDriveService, GoogleDriveService } from './GoogleDriveService';

// --- Interface ---

export interface ItemManagementService {
    updateItemProperty(
        type: 'lesson' | 'figure',
        itemId: string,
        property: 'categoryId' | 'schoolId' | 'instructorId',
        value: string | null
    ): Promise<void>;
    deleteItem(type: 'lesson' | 'figure', itemId: string): Promise<void>;
}

// --- Implementation ---

class ItemManagementServiceImpl implements ItemManagementService {
    private dataSvc: DataService;
    private localDBSvc: LocalDatabaseService;
    private syncQueueSvc: SyncQueueService;
    private driveSvc: GoogleDriveService;

    constructor(
        dataSvc: DataService,
        localDBSvc: LocalDatabaseService,
        syncQueueSvc: SyncQueueService,
        driveSvc: GoogleDriveService
    ) {
        this.dataSvc = dataSvc;
        this.localDBSvc = localDBSvc;
        this.syncQueueSvc = syncQueueSvc;
        this.driveSvc = driveSvc;
    }

    public async updateItemProperty(
        type: 'lesson' | 'figure',
        itemId: string,
        property: 'categoryId' | 'schoolId' | 'instructorId',
        value: string | null
    ): Promise<void> {
        try {
            if (type === 'lesson') {
                await this.dataSvc.updateLesson(itemId, { [property]: value });
            } else {
                await this.dataSvc.updateFigure(itemId, { [property]: value });
            }
            if (this.driveSvc.getAuthState().isSignedIn) {
                this.syncQueueSvc.addTask('sync-gallery', { type }, true);
            }
        } catch (err) {
            console.error(`Failed to update ${type} ${property}:`, err);
            throw err; // Re-throw to be handled by the UI if needed
        }
    }

    public async deleteItem(type: 'lesson' | 'figure', itemId: string): Promise<void> {
        try {
            const driveIdsToDelete = type === 'lesson'
                ? await this.dataSvc.deleteLesson(itemId)
                : [await this.dataSvc.deleteFigure(itemId)].filter((id): id is string => !!id);

            if (this.driveSvc.getAuthState().isSignedIn && driveIdsToDelete.length > 0) {
                await this.localDBSvc.addTombstones(driveIdsToDelete);
                this.syncQueueSvc.addTask('sync-gallery', { type }, true);
            }
        } catch (err) {
            console.error(`Failed to delete ${type}:`, err);
            throw err;
        }
    }
}

// --- Singleton Instance ---

export const itemManagementService: ItemManagementService = new ItemManagementServiceImpl(
    dataService,
    localDatabaseService,
    syncQueueService,
    googleDriveService
);
