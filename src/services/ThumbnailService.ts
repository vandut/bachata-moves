import { createLogger } from '../utils/logger';

const logger = createLogger('ThumbnailService');

// --- Interface ---
export interface ThumbnailService {
  generateThumbnailBlob(file: File, timeSeconds: number): Promise<Blob>;
}

// --- Implementation ---
class ThumbnailServiceImpl implements ThumbnailService {
  public generateThumbnailBlob = (file: File, timeSeconds: number): Promise<Blob> => {
    logger.info(`Generating thumbnail for ${file.name} at ${timeSeconds}s`);
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const videoUrl = URL.createObjectURL(file);

      if (!context) {
        URL.revokeObjectURL(videoUrl);
        return reject(new Error('Canvas 2D context is not available.'));
      }

      video.addEventListener('loadedmetadata', () => {
        video.width = video.videoWidth;
        video.height = video.videoHeight;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        video.currentTime = timeSeconds;
      });

      video.addEventListener('seeked', () => {
        context.drawImage(video, 0, 0, video.width, video.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(videoUrl);
          if (blob) {
            logger.info(`Successfully generated thumbnail blob (${(blob.size / 1024).toFixed(1)} KB)`);
            resolve(blob);
          } else {
            reject(new Error('Canvas to Blob conversion failed.'));
          }
        }, 'image/jpeg', 0.8);
      });

      video.addEventListener('error', (err) => {
        URL.revokeObjectURL(videoUrl);
        logger.error("Video thumbnail generation error:", err);
        reject(new Error('Failed to load video for thumbnail generation.'));
      });

      video.preload = 'metadata';
      video.src = videoUrl;
      video.load();
    });
  };
}

// --- Singleton Instance ---
export const thumbnailService: ThumbnailService = new ThumbnailServiceImpl();
