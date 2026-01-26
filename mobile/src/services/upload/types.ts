/**
 * Video Upload Service Types
 * Enterprise-grade upload management for challenge videos
 */

export type UploadStatus =
  | 'pending'
  | 'validating'
  | 'uploading'
  | 'paused'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface PendingUpload {
  id: string;
  challengeId?: string;
  localUri: string;
  storagePath: string;
  bytesTransferred: number;
  totalBytes: number;
  status: UploadStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttemptAt: number;
  completedAt?: number;
  downloadUrl?: string;
  error?: UploadError;
  metadata: UploadMetadata;
}

export interface UploadMetadata {
  duration: number;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  userId: string;
}

export interface UploadError {
  code: UploadErrorCode;
  message: string;
  details?: string;
  timestamp: number;
  isRetryable: boolean;
}

export type UploadErrorCode =
  | 'VALIDATION_FAILED'
  | 'NETWORK_ERROR'
  | 'STORAGE_ERROR'
  | 'QUOTA_EXCEEDED'
  | 'UNAUTHORIZED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface UploadProgress {
  uploadId: string;
  bytesTransferred: number;
  totalBytes: number;
  progress: number; // 0-100
  status: UploadStatus;
  estimatedTimeRemaining?: number; // seconds
}

export interface UploadResult {
  success: boolean;
  uploadId: string;
  downloadUrl?: string;
  storagePath?: string;
  error?: UploadError;
}

export interface UploadOptions {
  challengeId?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  onProgress?: (progress: UploadProgress) => void;
  onStateChange?: (status: UploadStatus) => void;
  onError?: (error: UploadError) => void;
}

export interface VideoValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata: VideoMetadata;
}

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  value?: number | string;
  limit?: number | string;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

export type ValidationErrorCode =
  | 'DURATION_TOO_LONG'
  | 'DURATION_TOO_SHORT'
  | 'FILE_TOO_LARGE'
  | 'INVALID_FORMAT'
  | 'FILE_CORRUPTED'
  | 'FILE_NOT_FOUND';

export interface VideoMetadata {
  duration: number;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
}

// Storage path constants
export const STORAGE_PATHS = {
  CHALLENGES: 'challenges',
  PROFILES: 'profiles',
  SPOTS: 'spots',
} as const;

// Validation limits
export const VIDEO_LIMITS = {
  MAX_DURATION_SECONDS: 15,
  MIN_DURATION_SECONDS: 5,
  MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024, // 100MB
  ALLOWED_MIME_TYPES: ['video/mp4', 'video/quicktime', 'video/x-m4v'],
} as const;

// Retry configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 30000,
  BACKOFF_MULTIPLIER: 2,
} as const;
