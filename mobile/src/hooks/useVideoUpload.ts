/**
 * useVideoUpload Hook
 * React hook for video upload with progress tracking
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getUploadService,
  UploadProgress,
  UploadStatus,
  UploadResult,
  UploadError,
  PendingUpload,
} from '@/services/upload';

export interface UseVideoUploadState {
  isUploading: boolean;
  isPaused: boolean;
  isValidating: boolean;
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  status: UploadStatus | null;
  error: UploadError | null;
  uploadId: string | null;
  estimatedTimeRemaining: number | null;
}

export interface UseVideoUploadActions {
  upload: (localUri: string, challengeId?: string) => Promise<UploadResult>;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  cancel: () => Promise<boolean>;
  retry: () => Promise<UploadResult | null>;
  reset: () => void;
}

export type UseVideoUploadReturn = UseVideoUploadState & UseVideoUploadActions;

const initialState: UseVideoUploadState = {
  isUploading: false,
  isPaused: false,
  isValidating: false,
  progress: 0,
  bytesTransferred: 0,
  totalBytes: 0,
  status: null,
  error: null,
  uploadId: null,
  estimatedTimeRemaining: null,
};

/**
 * Hook for managing video uploads with progress tracking
 */
export function useVideoUpload(): UseVideoUploadReturn {
  const [state, setState] = useState<UseVideoUploadState>(initialState);
  const uploadService = useRef(getUploadService());
  const lastLocalUri = useRef<string | null>(null);
  const lastChallengeId = useRef<string | undefined>(undefined);

  // Handle progress updates
  const handleProgress = useCallback((progress: UploadProgress) => {
    setState((prev) => ({
      ...prev,
      progress: progress.progress,
      bytesTransferred: progress.bytesTransferred,
      totalBytes: progress.totalBytes,
      estimatedTimeRemaining: progress.estimatedTimeRemaining ?? null,
    }));
  }, []);

  // Handle state changes
  const handleStateChange = useCallback((status: UploadStatus) => {
    setState((prev) => ({
      ...prev,
      status,
      isUploading: status === 'uploading',
      isPaused: status === 'paused',
      isValidating: status === 'validating',
      error: status === 'failed' ? prev.error : null,
    }));
  }, []);

  // Handle errors
  const handleError = useCallback((error: UploadError) => {
    setState((prev) => ({
      ...prev,
      error,
      isUploading: false,
    }));
  }, []);

  // Upload function
  const upload = useCallback(
    async (localUri: string, challengeId?: string): Promise<UploadResult> => {
      lastLocalUri.current = localUri;
      lastChallengeId.current = challengeId;

      setState({
        ...initialState,
        isValidating: true,
        status: 'validating',
      });

      const result = await uploadService.current.uploadVideo(localUri, {
        challengeId,
        onProgress: handleProgress,
        onStateChange: handleStateChange,
        onError: handleError,
      });

      if (result.success) {
        setState((prev) => ({
          ...prev,
          uploadId: result.uploadId,
          status: 'completed',
          isUploading: false,
          isValidating: false,
          progress: 100,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          uploadId: result.uploadId,
          error: result.error || null,
          isUploading: false,
          isValidating: false,
        }));
      }

      return result;
    },
    [handleProgress, handleStateChange, handleError]
  );

  // Pause function
  const pause = useCallback(async (): Promise<boolean> => {
    if (!state.uploadId) return false;
    const success = await uploadService.current.pauseUpload(state.uploadId);
    if (success) {
      setState((prev) => ({
        ...prev,
        isPaused: true,
        isUploading: false,
        status: 'paused',
      }));
    }
    return success;
  }, [state.uploadId]);

  // Resume function
  const resume = useCallback(async (): Promise<boolean> => {
    if (!state.uploadId) return false;
    setState((prev) => ({
      ...prev,
      isPaused: false,
      isUploading: true,
      status: 'uploading',
    }));
    return uploadService.current.resumeUpload(state.uploadId);
  }, [state.uploadId]);

  // Cancel function
  const cancel = useCallback(async (): Promise<boolean> => {
    if (!state.uploadId) return false;
    const success = await uploadService.current.cancelUpload(state.uploadId);
    if (success) {
      setState(initialState);
    }
    return success;
  }, [state.uploadId]);

  // Retry function
  const retry = useCallback(async (): Promise<UploadResult | null> => {
    if (!lastLocalUri.current) return null;
    return upload(lastLocalUri.current, lastChallengeId.current);
  }, [upload]);

  // Reset function
  const reset = useCallback(() => {
    if (state.uploadId && state.isUploading) {
      uploadService.current.cancelUpload(state.uploadId);
    }
    setState(initialState);
    lastLocalUri.current = null;
    lastChallengeId.current = undefined;
  }, [state.uploadId, state.isUploading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't cancel on unmount - let uploads continue in background
    };
  }, []);

  return {
    ...state,
    upload,
    pause,
    resume,
    cancel,
    retry,
    reset,
  };
}

/**
 * Hook to get pending uploads (for showing in UI)
 */
export function usePendingUploads(): {
  pendingUploads: PendingUpload[];
  refresh: () => Promise<void>;
  isLoading: boolean;
} {
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const uploadService = useRef(getUploadService());

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const uploads = await uploadService.current.restorePendingUploads();
      setPendingUploads(uploads);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { pendingUploads, refresh, isLoading };
}
