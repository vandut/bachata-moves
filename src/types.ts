// This declaration helps TypeScript understand the File System Access API types
// even if they are not in the default library definitions.

export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export interface FigureCategory {
  id: string;
  name:string;
  driveId?: string;
  modifiedTime?: string;
}

export interface LessonCategory {
  id: string;
  name: string;
  driveId?: string;
  modifiedTime?: string;
}

export interface School {
  id: string;
  name:string;
  driveId?: string;
  modifiedTime?: string;
}

export interface Instructor {
  id: string;
  name:string;
  driveId?: string;
  modifiedTime?: string;
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
