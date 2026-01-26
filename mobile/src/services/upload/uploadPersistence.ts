/**
 * Upload Persistence Service
 * Persists pending uploads to AsyncStorage for recovery after app restarts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PendingUpload, UploadStatus } from './types';

const STORAGE_KEY = '@skatehubba/pending_uploads';
const MAX_STORED_UPLOADS = 10;
const STALE_UPLOAD_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Save a pending upload to persistent storage
 */
export async function savePendingUpload(upload: PendingUpload): Promise<void> {
  try {
    const uploads = await getPendingUploads();
    const existingIndex = uploads.findIndex(u => u.id === upload.id);

    if (existingIndex >= 0) {
      uploads[existingIndex] = upload;
    } else {
      uploads.push(upload);
    }

    // Keep only recent uploads
    const recentUploads = uploads
      .filter(u => Date.now() - u.createdAt < STALE_UPLOAD_THRESHOLD_MS)
      .slice(-MAX_STORED_UPLOADS);

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recentUploads));
  } catch (error) {
    console.error('[UploadPersistence] Failed to save pending upload:', error);
  }
}

/**
 * Get all pending uploads from storage
 */
export async function getPendingUploads(): Promise<PendingUpload[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const uploads: PendingUpload[] = JSON.parse(data);

    // Filter out stale uploads
    const validUploads = uploads.filter(
      u => Date.now() - u.createdAt < STALE_UPLOAD_THRESHOLD_MS
    );

    // If we filtered some out, save the cleaned list
    if (validUploads.length !== uploads.length) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(validUploads));
    }

    return validUploads;
  } catch (error) {
    console.error('[UploadPersistence] Failed to get pending uploads:', error);
    return [];
  }
}

/**
 * Get pending uploads that can be resumed
 */
export async function getResumableUploads(): Promise<PendingUpload[]> {
  const uploads = await getPendingUploads();
  const resumableStatuses: UploadStatus[] = ['pending', 'uploading', 'paused', 'failed'];

  return uploads.filter(u => resumableStatuses.includes(u.status));
}

/**
 * Remove a pending upload from storage
 */
export async function removePendingUpload(uploadId: string): Promise<void> {
  try {
    const uploads = await getPendingUploads();
    const filtered = uploads.filter(u => u.id !== uploadId);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('[UploadPersistence] Failed to remove pending upload:', error);
  }
}

/**
 * Update the status of a pending upload
 */
export async function updateUploadStatus(
  uploadId: string,
  updates: Partial<PendingUpload>
): Promise<void> {
  try {
    const uploads = await getPendingUploads();
    const index = uploads.findIndex(u => u.id === uploadId);

    if (index >= 0) {
      uploads[index] = { ...uploads[index], ...updates };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(uploads));
    }
  } catch (error) {
    console.error('[UploadPersistence] Failed to update upload status:', error);
  }
}

/**
 * Clear all pending uploads
 */
export async function clearAllPendingUploads(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[UploadPersistence] Failed to clear pending uploads:', error);
  }
}

/**
 * Get count of pending uploads
 */
export async function getPendingUploadCount(): Promise<number> {
  const uploads = await getResumableUploads();
  return uploads.length;
}

/**
 * Check if there are any pending uploads
 */
export async function hasPendingUploads(): Promise<boolean> {
  const count = await getPendingUploadCount();
  return count > 0;
}
