import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useState, useCallback } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Camera, CameraType } from "expo-camera";
import { Video } from "expo-av";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions, auth } from "@/lib/firebase.config";
import { showMessage } from "react-native-flash-message";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { useVideoUpload } from "@/hooks/useVideoUpload";
import { VIDEO_LIMITS } from "@/services/upload";

const createChallenge = httpsCallable(functions, "createChallenge");

export default function NewChallengeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);

  // Use the enterprise video upload hook
  const {
    isUploading,
    isValidating,
    isPaused,
    progress,
    status,
    error: uploadError,
    upload,
    pause,
    resume,
    cancel,
    retry,
    reset,
    estimatedTimeRemaining,
  } = useVideoUpload();

  // Validate opponent UID is provided
  if (!params.opponentUid) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Error: No opponent selected</Text>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back to previous screen"
          style={styles.button}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const challengeMutation = useMutation({
    mutationFn: async ({ clipUrl, thumbnailUrl }: { clipUrl: string; thumbnailUrl?: string }) => {
      const result = await createChallenge({
        opponentUid: params.opponentUid as string,
        clipUrl,
        clipDurationSec: 15,
        thumbnailUrl,
      });
      return result.data;
    },
    onSuccess: () => {
      showMessage({
        message: "Challenge sent! 🔥",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
      router.back();
    },
    onError: (error: any) => {
      showMessage({
        message: error?.message || "Failed to send challenge",
        type: "danger",
      });
    },
  });

  const requestPermissions = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === "granted");
  };

  const startRecording = async () => {
    if (!camera) return;

    setRecording(true);
    const video = await camera.recordAsync({
      maxDuration: 15, // One-take rule: exactly 15 seconds
      quality: "720p",
    });
    setRecording(false);
    setVideoUri(video.uri);
  };

  const stopRecording = () => {
    if (camera && recording) {
      camera.stopRecording();
    }
  };

  const submitChallenge = useCallback(async () => {
    if (!videoUri || !auth.currentUser) {
      showMessage({
        message: "Not authenticated or no video to upload",
        type: "danger",
      });
      return;
    }

    // Use the enterprise upload service
    const result = await upload(videoUri, params.opponentUid as string);

    if (result.success && result.downloadUrl) {
      // Auto-send challenge with uploaded video
      challengeMutation.mutate({
        clipUrl: result.downloadUrl,
        thumbnailUrl: undefined,
      });
    } else if (result.error) {
      showMessage({
        message: result.error.message,
        type: "danger",
      });
    }
  }, [videoUri, params.opponentUid, upload, challengeMutation]);

  const handleRetake = useCallback(() => {
    reset();
    setVideoUri(null);
  }, [reset]);

  const handleCancel = useCallback(async () => {
    await cancel();
    router.back();
  }, [cancel, router]);

  const handlePauseResume = useCallback(async () => {
    if (isPaused) {
      await resume();
    } else {
      await pause();
    }
  }, [isPaused, pause, resume]);

  // Format estimated time remaining
  const formatTimeRemaining = (seconds: number | null): string => {
    if (seconds === null || seconds <= 0) return "";
    if (seconds < 60) return `${seconds}s remaining`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s remaining`;
  };

  // Get status message for upload state
  const getStatusMessage = (): string => {
    if (isValidating) return "Validating video...";
    if (isPaused) return "Upload paused";
    if (isUploading) {
      const timeStr = formatTimeRemaining(estimatedTimeRemaining);
      return timeStr ? `Uploading ${progress}% - ${timeStr}` : `Uploading ${progress}%`;
    }
    if (status === "completed") return "Upload complete!";
    if (status === "failed" && uploadError) return uploadError.message;
    return "Send Challenge";
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Grant camera permission"
          style={styles.button}
          onPress={requestPermissions}
        >
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!videoUri ? (
        <>
          <Camera style={styles.camera} type={CameraType.back} ref={(ref) => setCamera(ref)}>
            <View style={styles.controls}>
              <Text
                accessibilityLabel={`Recording time limit: ${VIDEO_LIMITS.MAX_DURATION_SECONDS} seconds, one take only`}
                style={styles.timer}
              >
                {VIDEO_LIMITS.MAX_DURATION_SECONDS} seconds • One-take only
              </Text>
            </View>
          </Camera>

          <View style={styles.bottomControls}>
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel={recording ? "Stop recording video" : "Start recording video"}
              accessibilityState={{ disabled: false, selected: recording }}
              style={[styles.recordButton, recording && styles.recordingButton]}
              onPress={recording ? stopRecording : startRecording}
            >
              <Ionicons
                name={recording ? "stop" : "videocam"}
                size={32}
                color={SKATE.colors.white}
              />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Video
            source={{ uri: videoUri }}
            style={styles.preview}
            useNativeControls
            isLooping
            shouldPlay={!isUploading && !isValidating}
          />

          {/* Progress bar for upload */}
          {(isUploading || isValidating) && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBackground}>
                <View
                  style={[styles.progressFill, { width: `${progress}%` }]}
                />
              </View>
              <Text style={styles.progressText}>{getStatusMessage()}</Text>
            </View>
          )}

          {/* Error state with retry option */}
          {status === "failed" && uploadError && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={24} color={SKATE.colors.blood} />
              <Text style={styles.errorText}>{uploadError.message}</Text>
              {uploadError.isRetryable && (
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Retry upload"
                  style={styles.retryButton}
                  onPress={retry}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.actions}>
            {/* Cancel/Retake button */}
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel={isUploading ? "Cancel upload" : "Retake video"}
              style={styles.actionButton}
              onPress={isUploading ? handleCancel : handleRetake}
              disabled={challengeMutation.isPending}
            >
              <Text style={styles.actionButtonText}>
                {isUploading ? "Cancel" : "Retake"}
              </Text>
            </TouchableOpacity>

            {/* Pause/Resume button (only during upload) */}
            {isUploading && (
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel={isPaused ? "Resume upload" : "Pause upload"}
                style={[styles.actionButton, styles.pauseButton]}
                onPress={handlePauseResume}
              >
                <Ionicons
                  name={isPaused ? "play" : "pause"}
                  size={20}
                  color={SKATE.colors.white}
                />
              </TouchableOpacity>
            )}

            {/* Submit button */}
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Send challenge to opponent"
              accessibilityState={{
                disabled: challengeMutation.isPending || isUploading || isValidating,
              }}
              style={[
                styles.actionButton,
                styles.submitButton,
                (isUploading || isValidating) && styles.submitButtonDisabled,
              ]}
              onPress={submitChallenge}
              disabled={challengeMutation.isPending || isUploading || isValidating}
            >
              {isUploading || isValidating || challengeMutation.isPending ? (
                <View style={styles.uploadStatus}>
                  <ActivityIndicator color={SKATE.colors.white} size="small" />
                  <Text style={styles.uploadText}>
                    {isValidating ? "Validating..." : `${progress}%`}
                  </Text>
                </View>
              ) : (
                <Text style={styles.actionButtonText}>Send Challenge</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: SKATE.colors.white,
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xxl,
    borderRadius: SKATE.borderRadius.md,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
  },
  buttonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  camera: {
    flex: 1,
    width: "100%",
  },
  controls: {
    flex: 1,
    backgroundColor: "transparent",
    padding: SKATE.spacing.xl,
  },
  timer: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: SKATE.spacing.sm,
    borderRadius: SKATE.borderRadius.md,
  },
  bottomControls: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: SKATE.colors.blood,
    justifyContent: "center",
    alignItems: "center",
  },
  recordingButton: {
    backgroundColor: SKATE.colors.orange,
  },
  preview: {
    flex: 1,
    width: "100%",
  },
  actions: {
    flexDirection: "row",
    gap: SKATE.spacing.md,
    padding: SKATE.spacing.xl,
  },
  actionButton: {
    flex: 1,
    backgroundColor: SKATE.colors.gray,
    paddingVertical: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    alignItems: "center",
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  submitButton: {
    backgroundColor: SKATE.colors.orange,
  },
  actionButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  uploadStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
  },
  uploadText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
  progressContainer: {
    paddingHorizontal: SKATE.spacing.xl,
    paddingVertical: SKATE.spacing.md,
    backgroundColor: SKATE.colors.grime,
  },
  progressBackground: {
    height: 6,
    backgroundColor: SKATE.colors.gray,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: SKATE.colors.orange,
    borderRadius: 3,
  },
  progressText: {
    color: SKATE.colors.white,
    fontSize: 12,
    marginTop: SKATE.spacing.sm,
    textAlign: "center",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 26, 26, 0.1)",
    padding: SKATE.spacing.md,
    marginHorizontal: SKATE.spacing.xl,
    marginVertical: SKATE.spacing.sm,
    borderRadius: SKATE.borderRadius.md,
    gap: SKATE.spacing.sm,
  },
  errorText: {
    flex: 1,
    color: SKATE.colors.blood,
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: SKATE.colors.blood,
    paddingVertical: SKATE.spacing.sm,
    paddingHorizontal: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.sm,
  },
  retryButtonText: {
    color: SKATE.colors.white,
    fontSize: 12,
    fontWeight: "bold",
  },
  pauseButton: {
    backgroundColor: SKATE.colors.grime,
    paddingHorizontal: SKATE.spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
});
