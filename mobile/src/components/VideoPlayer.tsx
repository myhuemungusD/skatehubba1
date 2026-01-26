/**
 * VideoPlayer Component
 * Reusable video player for challenge clips
 */

import { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { SKATE } from '@/theme';

interface VideoPlayerProps {
  uri: string;
  posterUri?: string;
  autoPlay?: boolean;
  loop?: boolean;
  showControls?: boolean;
  onPlaybackStatusUpdate?: (status: AVPlaybackStatus) => void;
  onError?: (error: string) => void;
  style?: object;
}

export function VideoPlayer({
  uri,
  posterUri,
  autoPlay = false,
  loop = true,
  showControls = true,
  onPlaybackStatusUpdate,
  onError,
  style,
}: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handlePlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (status.isLoaded) {
        setIsLoading(false);
        setIsPlaying(status.isPlaying);
        setDuration(status.durationMillis || 0);
        setProgress(status.positionMillis || 0);
      } else if (status.error) {
        setError(status.error);
        onError?.(status.error);
      }
      onPlaybackStatusUpdate?.(status);
    },
    [onPlaybackStatusUpdate, onError]
  );

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  }, [isPlaying]);

  const toggleMute = useCallback(async () => {
    if (!videoRef.current) return;
    await videoRef.current.setIsMutedAsync(!isMuted);
    setIsMuted(!isMuted);
  }, [isMuted]);

  const replay = useCallback(async () => {
    if (!videoRef.current) return;
    await videoRef.current.setPositionAsync(0);
    await videoRef.current.playAsync();
  }, []);

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer, style]}>
        <Ionicons name="alert-circle" size={48} color={SKATE.colors.blood} />
        <Text style={styles.errorText}>Failed to load video</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => setError(null)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Video
        ref={videoRef}
        source={{ uri }}
        posterSource={posterUri ? { uri: posterUri } : undefined}
        usePoster={!!posterUri}
        posterStyle={styles.poster}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={autoPlay}
        isLooping={loop}
        isMuted={isMuted}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
      />

      {/* Loading overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={SKATE.colors.orange} />
        </View>
      )}

      {/* Controls overlay */}
      {showControls && !isLoading && (
        <TouchableOpacity
          style={styles.controlsOverlay}
          onPress={togglePlayPause}
          activeOpacity={0.8}
        >
          {/* Play/Pause button */}
          {!isPlaying && (
            <View style={styles.playButton}>
              <Ionicons name="play" size={48} color={SKATE.colors.white} />
            </View>
          )}

          {/* Bottom controls */}
          <View style={styles.bottomControls}>
            {/* Progress bar */}
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${duration > 0 ? (progress / duration) * 100 : 0}%` },
                ]}
              />
            </View>

            {/* Time and buttons */}
            <View style={styles.controlsRow}>
              <Text style={styles.timeText}>
                {formatTime(progress)} / {formatTime(duration)}
              </Text>

              <View style={styles.controlButtons}>
                <TouchableOpacity onPress={replay} style={styles.controlButton}>
                  <Ionicons name="refresh" size={20} color={SKATE.colors.white} />
                </TouchableOpacity>

                <TouchableOpacity onPress={toggleMute} style={styles.controlButton}>
                  <Ionicons
                    name={isMuted ? 'volume-mute' : 'volume-high'}
                    size={20}
                    color={SKATE.colors.white}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: SKATE.colors.ink,
    borderRadius: SKATE.borderRadius.md,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    aspectRatio: 9 / 16,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -36 }, { translateY: -36 }],
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    padding: SKATE.spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  progressBar: {
    height: 4,
    backgroundColor: SKATE.colors.gray,
    borderRadius: 2,
    marginBottom: SKATE.spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: SKATE.colors.orange,
    borderRadius: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    color: SKATE.colors.white,
    fontSize: 12,
  },
  controlButtons: {
    flexDirection: 'row',
    gap: SKATE.spacing.md,
  },
  controlButton: {
    padding: SKATE.spacing.xs,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    aspectRatio: 9 / 16,
    backgroundColor: SKATE.colors.grime,
  },
  errorText: {
    color: SKATE.colors.white,
    fontSize: 14,
    marginTop: SKATE.spacing.sm,
    marginBottom: SKATE.spacing.md,
  },
  retryButton: {
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.sm,
    paddingHorizontal: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.sm,
  },
  retryButtonText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
});
