/**
 * Upload Persistence Unit Tests
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  savePendingUpload,
  getPendingUploads,
  getResumableUploads,
  removePendingUpload,
  updateUploadStatus,
  clearAllPendingUploads,
  getPendingUploadCount,
  hasPendingUploads,
} from '../src/services/upload/uploadPersistence';
import { PendingUpload } from '../src/services/upload/types';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
  multiRemove: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('Upload Persistence', () => {
  const mockUpload: PendingUpload = {
    id: 'test-upload-1',
    localUri: '/path/to/video.mp4',
    storagePath: 'challenges/test/video.mp4',
    bytesTransferred: 0,
    totalBytes: 1000000,
    status: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    lastAttemptAt: Date.now(),
    metadata: {
      duration: 15,
      fileSize: 1000000,
      mimeType: 'video/mp4',
      userId: 'user123',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('savePendingUpload', () => {
    it('should save a new upload', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue(undefined);

      await savePendingUpload(mockUpload);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@skatehubba/pending_uploads',
        expect.any(String)
      );

      const savedData = JSON.parse(
        mockAsyncStorage.setItem.mock.calls[0][1] as string
      );
      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe(mockUpload.id);
    });

    it('should update existing upload', async () => {
      const existingUploads = [mockUpload];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingUploads));
      mockAsyncStorage.setItem.mockResolvedValue(undefined);

      const updatedUpload = { ...mockUpload, status: 'uploading' as const };
      await savePendingUpload(updatedUpload);

      const savedData = JSON.parse(
        mockAsyncStorage.setItem.mock.calls[0][1] as string
      );
      expect(savedData).toHaveLength(1);
      expect(savedData[0].status).toBe('uploading');
    });

    it('should limit stored uploads to 10', async () => {
      const manyUploads = Array.from({ length: 15 }, (_, i) => ({
        ...mockUpload,
        id: `upload-${i}`,
        createdAt: Date.now() - i * 1000,
      }));
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(manyUploads));
      mockAsyncStorage.setItem.mockResolvedValue(undefined);

      await savePendingUpload({ ...mockUpload, id: 'new-upload' });

      const savedData = JSON.parse(
        mockAsyncStorage.setItem.mock.calls[0][1] as string
      );
      expect(savedData.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getPendingUploads', () => {
    it('should return empty array when no uploads', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const uploads = await getPendingUploads();

      expect(uploads).toEqual([]);
    });

    it('should return stored uploads', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify([mockUpload]));

      const uploads = await getPendingUploads();

      expect(uploads).toHaveLength(1);
      expect(uploads[0].id).toBe(mockUpload.id);
    });

    it('should filter out stale uploads', async () => {
      const staleUpload = {
        ...mockUpload,
        id: 'stale-upload',
        createdAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      };
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify([staleUpload, mockUpload]));
      mockAsyncStorage.setItem.mockResolvedValue(undefined);

      const uploads = await getPendingUploads();

      expect(uploads).toHaveLength(1);
      expect(uploads[0].id).toBe(mockUpload.id);
    });
  });

  describe('getResumableUploads', () => {
    it('should return only resumable uploads', async () => {
      const uploads = [
        { ...mockUpload, id: 'pending', status: 'pending' as const },
        { ...mockUpload, id: 'uploading', status: 'uploading' as const },
        { ...mockUpload, id: 'completed', status: 'completed' as const },
        { ...mockUpload, id: 'failed', status: 'failed' as const },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(uploads));

      const resumable = await getResumableUploads();

      expect(resumable).toHaveLength(3);
      expect(resumable.map(u => u.id)).toContain('pending');
      expect(resumable.map(u => u.id)).toContain('uploading');
      expect(resumable.map(u => u.id)).toContain('failed');
      expect(resumable.map(u => u.id)).not.toContain('completed');
    });
  });

  describe('removePendingUpload', () => {
    it('should remove upload by id', async () => {
      const uploads = [mockUpload, { ...mockUpload, id: 'other-upload' }];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(uploads));
      mockAsyncStorage.setItem.mockResolvedValue(undefined);

      await removePendingUpload(mockUpload.id);

      const savedData = JSON.parse(
        mockAsyncStorage.setItem.mock.calls[0][1] as string
      );
      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe('other-upload');
    });
  });

  describe('updateUploadStatus', () => {
    it('should update upload fields', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify([mockUpload]));
      mockAsyncStorage.setItem.mockResolvedValue(undefined);

      await updateUploadStatus(mockUpload.id, {
        status: 'uploading',
        bytesTransferred: 500000,
      });

      const savedData = JSON.parse(
        mockAsyncStorage.setItem.mock.calls[0][1] as string
      );
      expect(savedData[0].status).toBe('uploading');
      expect(savedData[0].bytesTransferred).toBe(500000);
    });
  });

  describe('clearAllPendingUploads', () => {
    it('should remove all uploads', async () => {
      mockAsyncStorage.removeItem.mockResolvedValue(undefined);

      await clearAllPendingUploads();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(
        '@skatehubba/pending_uploads'
      );
    });
  });

  describe('getPendingUploadCount', () => {
    it('should return count of resumable uploads', async () => {
      const uploads = [
        { ...mockUpload, status: 'pending' as const },
        { ...mockUpload, id: 'other', status: 'completed' as const },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(uploads));

      const count = await getPendingUploadCount();

      expect(count).toBe(1);
    });
  });

  describe('hasPendingUploads', () => {
    it('should return true when there are pending uploads', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify([mockUpload]));

      const has = await hasPendingUploads();

      expect(has).toBe(true);
    });

    it('should return false when no pending uploads', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const has = await hasPendingUploads();

      expect(has).toBe(false);
    });
  });
});
