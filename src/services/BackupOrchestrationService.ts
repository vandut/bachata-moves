import React from 'react';
import { backupService, BackupService } from './BackupService';
import { useSettings } from '../contexts/SettingsContext';

// --- Interface and State ---
export interface BackupStatus {
    status: 'idle' | 'exporting' | 'importing' | 'success' | 'error' | 'awaiting-file' | 'awaiting-confirmation';
    progress: number | null;
    statusMessage: string; // Internal status for loading bars e.g., 'importStatus.validating'
    actionMessage: string | null; // User-facing message for success/error banners
    fileToImport: File | null;
    showImportConfirm: boolean;
}

export interface BackupOrchestrationService {
    subscribe(listener: (status: BackupStatus) => void): () => void;
    getStatus(): BackupStatus;
    exportData(): void;
    requestImport(): void;
    handleFileSelected(file: File): void;
    confirmImport(): void;
    cancelImport(): void;
}

// --- Implementation ---
class BackupOrchestrationServiceImpl implements BackupOrchestrationService {
    private backupSvc: BackupService;
    private listeners = new Set<(status: BackupStatus) => void>();
    private state: BackupStatus = {
        status: 'idle',
        progress: null,
        statusMessage: '',
        actionMessage: null,
        fileToImport: null,
        showImportConfirm: false,
    };

    constructor(backupSvc: BackupService) {
        this.backupSvc = backupSvc;
    }

    private setState(updates: Partial<BackupStatus>) {
        this.state = { ...this.state, ...updates };
        this.listeners.forEach(l => l(this.state));
    }

    public subscribe(listener: (status: BackupStatus) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public getStatus(): BackupStatus {
        return this.state;
    }

    public async exportData(): Promise<void> {
        this.setState({ status: 'exporting', progress: 0, statusMessage: 'settings.exporting', actionMessage: null });
        try {
            const onProgress = (p: number) => this.setState({ progress: p });
            const onStatusUpdate = (key: string) => this.setState({ statusMessage: key });
            
            await this.backupSvc.exportAllData(onProgress, onStatusUpdate);
            this.setState({ status: 'success', actionMessage: 'settings.exportSuccess' });
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                this.setState({ status: 'error', actionMessage: 'settings.exportError' });
            } else {
                this.setState({ status: 'idle' });
            }
        } finally {
            setTimeout(() => this.setState({ status: 'idle', progress: null, statusMessage: '', actionMessage: null }), 5000);
        }
    }

    public requestImport(): void {
        this.setState({ status: 'awaiting-file', actionMessage: null });
    }

    public handleFileSelected(file: File): void {
        this.setState({ fileToImport: file, showImportConfirm: true, status: 'awaiting-confirmation' });
    }

    public async confirmImport(): Promise<void> {
        if (!this.state.fileToImport) return;
        
        // FIX: Cast `useSettings` to `any` to resolve TypeScript error. The `getState` method is a custom, dynamically attached property for a specific use case, and casting allows access without broader type modifications.
        const { reloadAllData } = (useSettings as any).getState();

        this.setState({ status: 'importing', showImportConfirm: false, statusMessage: 'settings.importing' });
        try {
            const onStatusUpdate = (key: string) => this.setState({ statusMessage: key });
            await this.backupSvc.importData(this.state.fileToImport, onStatusUpdate);
            this.setState({ status: 'success', actionMessage: 'settings.importSuccess' });
            reloadAllData(); // This will trigger a reload in the SettingsContext
        } catch (err: any) {
            const errorMessage = (err instanceof Error && err.message) ? err.message : 'settings.importErrorGeneral';
            this.setState({ status: 'error', actionMessage: `${'settings.importError'}: ${errorMessage}`});
        } finally {
            this.setState({ fileToImport: null });
            setTimeout(() => this.setState({ status: 'idle', progress: null, statusMessage: '', actionMessage: null }), 5000);
        }
    }

    public cancelImport(): void {
        this.setState({ status: 'idle', fileToImport: null, showImportConfirm: false });
    }
}

// --- Singleton and Hook ---
export const backupOrchestrationService: BackupOrchestrationService = new BackupOrchestrationServiceImpl(backupService);

// A simple state management for useSettings within the service. This is a bit of a hack
// to avoid passing reloadAllData through every method, but it works for this specific case.
let _useSettingsState: any = null;
const useSettingsSubscriber = () => {
    _useSettingsState = useSettings();
    return null;
};
// FIX: Cast `useSettings` to `any` to allow attaching a custom `getState` property, resolving the TypeScript error.
(useSettings as any).getState = () => _useSettingsState;


export const useBackupStatus = (): BackupStatus => {
    // This is a trick to get access to the context's reload function inside the service
    // without circular dependencies or prop drilling.
    useSettingsSubscriber();

    const [status, setStatus] = React.useState(backupOrchestrationService.getStatus());
    React.useEffect(() => {
        const unsubscribe = backupOrchestrationService.subscribe(setStatus);
        return unsubscribe;
    }, []);
    return status;
}