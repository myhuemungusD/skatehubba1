/**
 * Video Validator Unit Tests
 */

import { VIDEO_LIMITS } from '../src/services/upload/types';
import { getValidationErrorMessage, isVideoFile } from '../src/services/upload/videoValidator';

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn(),
}));

// Mock expo-av
jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn(),
    },
  },
}));

describe('Video Validator', () => {
  describe('VIDEO_LIMITS', () => {
    it('should have correct max duration', () => {
      expect(VIDEO_LIMITS.MAX_DURATION_SECONDS).toBe(15);
    });

    it('should have correct min duration', () => {
      expect(VIDEO_LIMITS.MIN_DURATION_SECONDS).toBe(5);
    });

    it('should have correct max file size', () => {
      expect(VIDEO_LIMITS.MAX_FILE_SIZE_BYTES).toBe(100 * 1024 * 1024);
    });

    it('should have correct allowed mime types', () => {
      expect(VIDEO_LIMITS.ALLOWED_MIME_TYPES).toContain('video/mp4');
      expect(VIDEO_LIMITS.ALLOWED_MIME_TYPES).toContain('video/quicktime');
      expect(VIDEO_LIMITS.ALLOWED_MIME_TYPES).toContain('video/x-m4v');
    });
  });

  describe('isVideoFile', () => {
    it('should return true for mp4 files', () => {
      expect(isVideoFile('/path/to/video.mp4')).toBe(true);
    });

    it('should return true for mov files', () => {
      expect(isVideoFile('/path/to/video.mov')).toBe(true);
    });

    it('should return true for m4v files', () => {
      expect(isVideoFile('/path/to/video.m4v')).toBe(true);
    });

    it('should return false for non-video files', () => {
      expect(isVideoFile('/path/to/image.jpg')).toBe(false);
      expect(isVideoFile('/path/to/document.pdf')).toBe(false);
    });

    it('should handle files without extension', () => {
      expect(isVideoFile('/path/to/noextension')).toBe(false);
    });
  });

  describe('getValidationErrorMessage', () => {
    it('should return empty string for no errors', () => {
      expect(getValidationErrorMessage([])).toBe('');
    });

    it('should format duration too long error', () => {
      const errors = [{
        code: 'DURATION_TOO_LONG' as const,
        message: 'Too long',
        value: 20,
        limit: 15,
      }];
      const message = getValidationErrorMessage(errors);
      expect(message).toContain('20 seconds');
      expect(message).toContain('Maximum is 15 seconds');
    });

    it('should format duration too short error', () => {
      const errors = [{
        code: 'DURATION_TOO_SHORT' as const,
        message: 'Too short',
        value: 3,
        limit: 5,
      }];
      const message = getValidationErrorMessage(errors);
      expect(message).toContain('3 seconds');
      expect(message).toContain('Minimum is 5 seconds');
    });

    it('should format file too large error', () => {
      const errors = [{
        code: 'FILE_TOO_LARGE' as const,
        message: 'Too large',
        value: 150 * 1024 * 1024,
        limit: 100 * 1024 * 1024,
      }];
      const message = getValidationErrorMessage(errors);
      expect(message).toContain('150MB');
      expect(message).toContain('Maximum is 100MB');
    });

    it('should format invalid format error', () => {
      const errors = [{
        code: 'INVALID_FORMAT' as const,
        message: 'Invalid format',
        value: 'video/avi',
      }];
      const message = getValidationErrorMessage(errors);
      expect(message).toContain('MP4 or MOV');
    });

    it('should format file not found error', () => {
      const errors = [{
        code: 'FILE_NOT_FOUND' as const,
        message: 'Not found',
      }];
      const message = getValidationErrorMessage(errors);
      expect(message).toContain('not found');
    });

    it('should format file corrupted error', () => {
      const errors = [{
        code: 'FILE_CORRUPTED' as const,
        message: 'Corrupted',
      }];
      const message = getValidationErrorMessage(errors);
      expect(message).toContain('corrupted');
    });

    it('should concatenate multiple errors', () => {
      const errors = [
        { code: 'DURATION_TOO_LONG' as const, message: 'Too long', value: 20, limit: 15 },
        { code: 'FILE_TOO_LARGE' as const, message: 'Too large', value: 150 * 1024 * 1024, limit: 100 * 1024 * 1024 },
      ];
      const message = getValidationErrorMessage(errors);
      expect(message).toContain('seconds');
      expect(message).toContain('MB');
    });
  });
});
