/**
 * Video Validator
 * Client-side validation for challenge videos
 * NOTE: Client validation is for UX only - server enforces final validation
 */

import * as FileSystem from 'expo-file-system';
import { Audio, AVPlaybackStatus } from 'expo-av';
import {
  VideoValidationResult,
  ValidationError,
  ValidationWarning,
  VideoMetadata,
  VIDEO_LIMITS,
} from './types';

/**
 * Validate a video file before upload
 * Checks duration, file size, and format
 */
export async function validateVideo(uri: string): Promise<VideoValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  let metadata: VideoMetadata = {
    duration: 0,
    fileSize: 0,
    mimeType: 'unknown',
  };

  try {
    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });

    if (!fileInfo.exists) {
      errors.push({
        code: 'FILE_NOT_FOUND',
        message: 'Video file not found',
      });
      return { isValid: false, errors, warnings, metadata };
    }

    metadata.fileSize = fileInfo.size || 0;

    // Check file size
    if (metadata.fileSize > VIDEO_LIMITS.MAX_FILE_SIZE_BYTES) {
      errors.push({
        code: 'FILE_TOO_LARGE',
        message: `Video must be under ${Math.round(VIDEO_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB`,
        value: metadata.fileSize,
        limit: VIDEO_LIMITS.MAX_FILE_SIZE_BYTES,
      });
    }

    // Warn if file is large but under limit
    const warningSizeThreshold = VIDEO_LIMITS.MAX_FILE_SIZE_BYTES * 0.8;
    if (metadata.fileSize > warningSizeThreshold && metadata.fileSize <= VIDEO_LIMITS.MAX_FILE_SIZE_BYTES) {
      warnings.push({
        code: 'LARGE_FILE',
        message: 'Large file may take longer to upload on slow connections',
      });
    }

    // Determine mime type from extension
    const extension = uri.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'mp4':
        metadata.mimeType = 'video/mp4';
        break;
      case 'mov':
        metadata.mimeType = 'video/quicktime';
        break;
      case 'm4v':
        metadata.mimeType = 'video/x-m4v';
        break;
      default:
        metadata.mimeType = 'video/mp4'; // Assume mp4 for recorded videos
    }

    // Check format
    if (!VIDEO_LIMITS.ALLOWED_MIME_TYPES.includes(metadata.mimeType)) {
      errors.push({
        code: 'INVALID_FORMAT',
        message: 'Please record in MP4 or MOV format',
        value: metadata.mimeType,
      });
    }

    // Get video duration using expo-av
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false }
      );
      const status = await sound.getStatusAsync() as AVPlaybackStatus;

      if (status.isLoaded && status.durationMillis) {
        metadata.duration = status.durationMillis / 1000;
      }

      await sound.unloadAsync();
    } catch {
      // Fallback: try loading as video
      // Duration validation will happen server-side if we can't get it here
      warnings.push({
        code: 'DURATION_UNKNOWN',
        message: 'Could not verify video duration locally',
      });
    }

    // Validate duration if we got it
    if (metadata.duration > 0) {
      if (metadata.duration > VIDEO_LIMITS.MAX_DURATION_SECONDS) {
        errors.push({
          code: 'DURATION_TOO_LONG',
          message: `Video must be ${VIDEO_LIMITS.MAX_DURATION_SECONDS} seconds or less`,
          value: metadata.duration,
          limit: VIDEO_LIMITS.MAX_DURATION_SECONDS,
        });
      }

      if (metadata.duration < VIDEO_LIMITS.MIN_DURATION_SECONDS) {
        errors.push({
          code: 'DURATION_TOO_SHORT',
          message: `Video must be at least ${VIDEO_LIMITS.MIN_DURATION_SECONDS} seconds`,
          value: metadata.duration,
          limit: VIDEO_LIMITS.MIN_DURATION_SECONDS,
        });
      }
    }

  } catch (error) {
    errors.push({
      code: 'FILE_CORRUPTED',
      message: 'Could not read video file',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metadata,
  };
}

/**
 * Get a user-friendly error message for validation errors
 */
export function getValidationErrorMessage(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  const messages = errors.map(error => {
    switch (error.code) {
      case 'DURATION_TOO_LONG':
        return `Video is ${Math.round(error.value as number)} seconds. Maximum is ${VIDEO_LIMITS.MAX_DURATION_SECONDS} seconds.`;
      case 'DURATION_TOO_SHORT':
        return `Video is only ${Math.round(error.value as number)} seconds. Minimum is ${VIDEO_LIMITS.MIN_DURATION_SECONDS} seconds.`;
      case 'FILE_TOO_LARGE':
        return `Video is too large (${Math.round((error.value as number) / (1024 * 1024))}MB). Maximum is ${Math.round(VIDEO_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.`;
      case 'INVALID_FORMAT':
        return 'Please use MP4 or MOV format.';
      case 'FILE_NOT_FOUND':
        return 'Video file not found. Please try recording again.';
      case 'FILE_CORRUPTED':
        return 'Video file appears to be corrupted. Please try recording again.';
      default:
        return error.message;
    }
  });

  return messages.join(' ');
}

/**
 * Quick check if a file path looks like a valid video
 */
export function isVideoFile(uri: string): boolean {
  const extension = uri.split('.').pop()?.toLowerCase();
  return ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm'].includes(extension || '');
}
