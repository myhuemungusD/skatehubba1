/**
 * Video Upload Service
 * Enterprise-grade video upload with resumable uploads, progress tracking,
 * persistence, and retry logic
 */

import { ref, uploadBytesResumable, getDownloadURL, UploadTask } from 'firebase/storage';
import * as FileSystem from 'expo-file-system';
import { storage, auth } from '@/lib/firebase.config';
import {
  PendingUpload,
  UploadStatus,
  UploadProgress,
  UploadResult,
  UploadOptions,
  UploadError,
  UploadErrorCode,
  VideoMetadata,
  STORAGE_PATHS,
  RETRY_CONFIG,
} from './types';
import { validateVideo, getValidationErrorMessage } from './videoValidator';
import {
  savePendingUpload,
  removePendingUpload,
  updateUploadStatus,
  getResumableUploads,
} from './uploadPersistence';
import { captureError, captureMessage } from '@/lib/errorTracking';

// Generate unique upload ID
function generateUploadId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Calculate retry delay with exponential backoff
function getRetryDelay(retryCount: number): number {
  const delay = RETRY_CONFIG.BASE_DELAY_MS * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount);
  return Math.min(delay, RETRY_CONFIG.MAX_DELAY_MS);
}

// Create upload error object
function createUploadError(
  code: UploadErrorCode,
  message: string,
  details?: string
): UploadError {
  const isRetryable = ['NETWORK_ERROR', 'TIMEOUT', 'STORAGE_ERROR'].includes(code);
  return {
    code,
    message,
    details,
    timestamp: Date.now(),
    isRetryable,
  };
}

// Map Firebase storage errors to our error codes
function mapStorageError(error: unknown): UploadError {
  if (error instanceof Error) {
    const errorCode = (error as { code?: string }).code || '';
    const errorMessage = error.message;

    if (errorCode.includes('unauthorized') || errorCode.includes('permission')) {
      return createUploadError('UNAUTHORIZED', 'Not authorized to upload', errorMessage);
    }

    if (errorCode.includes('quota')) {
      return createUploadError('QUOTA_EXCEEDED', 'Storage quota exceeded', errorMessage);
    }

    if (errorCode.includes('canceled')) {
      return createUploadError('CANCELLED', 'Upload was cancelled', errorMessage);
    }

    if (errorMessage.includes('network') || errorCode.includes('network')) {
      return createUploadError('NETWORK_ERROR', 'Network error. Please check your connection.', errorMessage);
    }

    return createUploadError('STORAGE_ERROR', 'Upload failed', errorMessage);
  }

  return createUploadError('UNKNOWN', 'An unexpected error occurred');
}

/**
 * Video Upload Service class
 * Manages video uploads with progress tracking, persistence, and retry logic
 */
export class VideoUploadService {
  private activeUploads: Map<string, UploadTask> = new Map();
  private uploadStates: Map<string, PendingUpload> = new Map();

  /**
   * Upload a video file to Firebase Storage
   */
  async uploadVideo(
    localUri: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const uploadId = generateUploadId();
    const user = auth.currentUser;

    if (!user) {
      const error = createUploadError('UNAUTHORIZED', 'Please sign in to upload');
      options.onError?.(error);
      return { success: false, uploadId, error };
    }

    // Validate video first
    options.onStateChange?.('validating');
    const validation = await validateVideo(localUri);

    if (!validation.isValid) {
      const errorMessage = getValidationErrorMessage(validation.errors);
      const error = createUploadError('VALIDATION_FAILED', errorMessage);
      options.onError?.(error);
      captureMessage('Video validation failed', { errors: validation.errors });
      return { success: false, uploadId, error };
    }

    // Create storage path
    const timestamp = Date.now();
    const storagePath = `${STORAGE_PATHS.CHALLENGES}/${options.challengeId || 'drafts'}/${user.uid}/${timestamp}.mp4`;

    // Create pending upload record
    const pendingUpload: PendingUpload = {
      id: uploadId,
      challengeId: options.challengeId,
      localUri,
      storagePath,
      bytesTransferred: 0,
      totalBytes: validation.metadata.fileSize,
      status: 'pending',
      retryCount: 0,
      maxRetries: options.maxRetries ?? RETRY_CONFIG.MAX_RETRIES,
      createdAt: timestamp,
      lastAttemptAt: timestamp,
      metadata: {
        duration: validation.metadata.duration,
        fileSize: validation.metadata.fileSize,
        mimeType: validation.metadata.mimeType,
        width: validation.metadata.width,
        height: validation.metadata.height,
        userId: user.uid,
      },
    };

    // Persist for recovery
    await savePendingUpload(pendingUpload);
    this.uploadStates.set(uploadId, pendingUpload);

    // Start upload
    return this.executeUpload(pendingUpload, options);
  }

  /**
   * Execute the actual upload with retry logic
   */
  private async executeUpload(
    upload: PendingUpload,
    options: UploadOptions
  ): Promise<UploadResult> {
    const { id: uploadId, localUri, storagePath, maxRetries } = upload;

    try {
      options.onStateChange?.('uploading');
      await this.updateUploadState(uploadId, { status: 'uploading', lastAttemptAt: Date.now() });

      // Read file as blob
      const response = await fetch(localUri);
      const blob = await response.blob();

      // Create upload task
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, blob, {
        contentType: upload.metadata.mimeType,
        customMetadata: {
          uploadId,
          userId: upload.metadata.userId,
          duration: String(upload.metadata.duration),
        },
      });

      this.activeUploads.set(uploadId, uploadTask);

      // Track upload progress
      const downloadUrl = await new Promise<string>((resolve, reject) => {
        let lastProgress = 0;
        let startTime = Date.now();

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );

            // Calculate estimated time remaining
            const elapsed = Date.now() - startTime;
            const rate = snapshot.bytesTransferred / (elapsed / 1000); // bytes per second
            const remaining = snapshot.totalBytes - snapshot.bytesTransferred;
            const estimatedTimeRemaining = rate > 0 ? Math.round(remaining / rate) : undefined;

            // Update state
            this.updateUploadState(uploadId, {
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
            });

            // Notify progress
            if (progress !== lastProgress) {
              lastProgress = progress;
              options.onProgress?.({
                uploadId,
                bytesTransferred: snapshot.bytesTransferred,
                totalBytes: snapshot.totalBytes,
                progress,
                status: 'uploading',
                estimatedTimeRemaining,
              });
            }
          },
          (error) => {
            reject(error);
          },
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            } catch (error) {
              reject(error);
            }
          }
        );
      });

      // Upload successful
      await this.updateUploadState(uploadId, {
        status: 'completed',
        downloadUrl,
        completedAt: Date.now(),
      });
      options.onStateChange?.('completed');
      this.activeUploads.delete(uploadId);

      // Remove from persistence (successful uploads don't need recovery)
      await removePendingUpload(uploadId);

      captureMessage('Video upload completed', { uploadId, storagePath });

      return {
        success: true,
        uploadId,
        downloadUrl,
        storagePath,
      };
    } catch (error) {
      const uploadError = mapStorageError(error);
      const currentUpload = this.uploadStates.get(uploadId);
      const currentRetryCount = currentUpload?.retryCount ?? 0;

      // Check if we should retry
      if (uploadError.isRetryable && currentRetryCount < maxRetries) {
        const retryDelay = getRetryDelay(currentRetryCount);

        captureMessage('Upload failed, retrying', {
          uploadId,
          retryCount: currentRetryCount + 1,
          maxRetries,
          delayMs: retryDelay,
        });

        await this.updateUploadState(uploadId, {
          retryCount: currentRetryCount + 1,
          error: uploadError,
          status: 'pending',
        });

        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return this.executeUpload(
          { ...upload, retryCount: currentRetryCount + 1 },
          options
        );
      }

      // Max retries exceeded or non-retryable error
      await this.updateUploadState(uploadId, {
        status: 'failed',
        error: uploadError,
      });
      options.onStateChange?.('failed');
      options.onError?.(uploadError);
      this.activeUploads.delete(uploadId);

      captureError(error instanceof Error ? error : new Error(String(error)), {
        uploadId,
        storagePath,
        retryCount: currentRetryCount,
      });

      return {
        success: false,
        uploadId,
        error: uploadError,
      };
    }
  }

  /**
   * Pause an active upload
   */
  async pauseUpload(uploadId: string): Promise<boolean> {
    const task = this.activeUploads.get(uploadId);
    if (task) {
      task.pause();
      await this.updateUploadState(uploadId, { status: 'paused' });
      return true;
    }
    return false;
  }

  /**
   * Resume a paused upload
   */
  async resumeUpload(uploadId: string): Promise<boolean> {
    const task = this.activeUploads.get(uploadId);
    if (task) {
      task.resume();
      await this.updateUploadState(uploadId, { status: 'uploading' });
      return true;
    }

    // If no active task, try to resume from persistence
    const upload = this.uploadStates.get(uploadId);
    if (upload && (upload.status === 'paused' || upload.status === 'failed')) {
      // Restart the upload
      const result = await this.executeUpload(upload, {});
      return result.success;
    }

    return false;
  }

  /**
   * Cancel an upload
   */
  async cancelUpload(uploadId: string): Promise<boolean> {
    const task = this.activeUploads.get(uploadId);
    if (task) {
      task.cancel();
      this.activeUploads.delete(uploadId);
    }

    await this.updateUploadState(uploadId, { status: 'cancelled' });
    await removePendingUpload(uploadId);
    this.uploadStates.delete(uploadId);

    return true;
  }

  /**
   * Retry a failed upload
   */
  async retryUpload(
    uploadId: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const upload = this.uploadStates.get(uploadId);

    if (!upload) {
      const error = createUploadError('UNKNOWN', 'Upload not found');
      return { success: false, uploadId, error };
    }

    // Reset retry count and status
    const updatedUpload: PendingUpload = {
      ...upload,
      retryCount: 0,
      status: 'pending',
      error: undefined,
    };

    await savePendingUpload(updatedUpload);
    this.uploadStates.set(uploadId, updatedUpload);

    return this.executeUpload(updatedUpload, options);
  }

  /**
   * Get status of an upload
   */
  getUploadStatus(uploadId: string): PendingUpload | undefined {
    return this.uploadStates.get(uploadId);
  }

  /**
   * Get all active uploads
   */
  getActiveUploads(): PendingUpload[] {
    return Array.from(this.uploadStates.values()).filter(
      (u) => u.status === 'uploading' || u.status === 'pending'
    );
  }

  /**
   * Restore pending uploads from persistence (call on app start)
   */
  async restorePendingUploads(): Promise<PendingUpload[]> {
    const uploads = await getResumableUploads();

    for (const upload of uploads) {
      this.uploadStates.set(upload.id, upload);
    }

    captureMessage('Restored pending uploads', { count: uploads.length });
    return uploads;
  }

  /**
   * Update upload state locally and persist
   */
  private async updateUploadState(
    uploadId: string,
    updates: Partial<PendingUpload>
  ): Promise<void> {
    const current = this.uploadStates.get(uploadId);
    if (current) {
      const updated = { ...current, ...updates };
      this.uploadStates.set(uploadId, updated);
      await updateUploadStatus(uploadId, updates);
    }
  }
}

// Singleton instance
let uploadServiceInstance: VideoUploadService | null = null;

/**
 * Get the singleton VideoUploadService instance
 */
export function getUploadService(): VideoUploadService {
  if (!uploadServiceInstance) {
    uploadServiceInstance = new VideoUploadService();
  }
  return uploadServiceInstance;
}

/**
 * Convenience function to upload a video
 */
export async function uploadChallengeVideo(
  localUri: string,
  challengeId: string | undefined,
  onProgress?: (progress: UploadProgress) => void,
  onStateChange?: (status: UploadStatus) => void
): Promise<UploadResult> {
  const service = getUploadService();
  return service.uploadVideo(localUri, {
    challengeId,
    onProgress,
    onStateChange,
  });
}
