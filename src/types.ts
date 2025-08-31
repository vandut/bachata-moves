// This declaration helps TypeScript understand the File System Access API types
// even if they are not in the default library definitions.

// --- File System Access API ---
// These declarations help TypeScript understand the experimental File System Access API types.
declare global {
  // FIX: Added missing type definitions for File System Access API to resolve conflicts.
  interface FileSystemCreateWritableOptions {
    keepExistingData?: boolean;
  }
  
  // FIX: Removed duplicate type definition for 'FileSystemWriteChunkType'.
  // This type is now part of the standard TypeScript DOM library, and redefining it
  // was causing a conflict. Removing this line resolves both reported errors.

  interface Window {
    showSaveFilePicker: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }

  interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: {
      description: string;
      accept: Record<string, string[]>;
    }[];
  }

  interface FileSystemFileHandle {
    // FIX: Updated method signature to match standard TypeScript library definitions.
    createWritable: (options?: FileSystemCreateWritableOptions) => Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    // FIX: Updated method signature to match standard TypeScript library definitions.
    write: (data: FileSystemWriteChunkType) => Promise<void>;
    close: () => Promise<void>;
  }
}


export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export interface FigureCategory {
  id: string;
  name:string;
  driveId?: string;
}

export interface LessonCategory {
  id: string;
  name: string;
  driveId?: string;
}

export interface School {
  id: string;
  name:string;
  driveId?: string;
}

export interface Instructor {
  id: string;
  name:string;
  driveId?: string;
}

export interface Figure {
  id: string;
  lessonId: string;
  name: string;
  description?: string | null;
  startTime: number; // Milliseconds
  endTime: number; // Milliseconds
  thumbTime: number; // Milliseconds from the start of the video
  categoryId?: string | null;
  schoolId?: string | null;
  instructorId?: string | null;
  driveId?: string;
  modifiedTime?: string;
}

export interface Lesson {
  id:string;
  videoId: string;
  uploadDate: string; // ISO 8601 string
  description?: string | null;
  startTime: number; // Milliseconds
  endTime: number; // Milliseconds
  thumbTime: number; // Milliseconds from the start of the video
  categoryId?: string | null;
  schoolId?: string | null;
  instructorId?: string | null;
  driveId?: string;
  videoDriveId?: string;
  modifiedTime?: string;
}

export type LessonSortOrder = 'newest' | 'oldest';
export type FigureSortOrder = 'newest' | 'oldest' | 'alphabetical_asc' | 'alphabetical_desc';

export interface AppData {
  lessons: Lesson[];
  figures: Figure[];
}

export interface ModalAction {
  label: string;
  onClick: () => void | Promise<void>;
  isDestructive?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
}