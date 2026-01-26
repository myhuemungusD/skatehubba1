/**
 * Challenge Detail Screen
 * View challenge clips and vote
 */

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Ionicons } from '@expo/vector-icons';
import { db, functions, auth } from '@/lib/firebase.config';
import { SKATE } from '@/theme';
import { VideoPlayer } from '@/components/VideoPlayer';
import { showMessage } from 'react-native-flash-message';

interface ChallengeClip {
  userId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  status: string;
  uploadedAt: Date;
}

interface Challenge {
  id: string;
  createdBy: string;
  opponent: string;
  participants: string[];
  status: string;
  clips: Record<string, ChallengeClip>;
  voting?: {
    deadline: Date;
    votes: Record<string, string>;
    result?: {
      winner: string;
      creatorVotes: number;
      opponentVotes: number;
    };
  };
  deadline: Date;
  createdAt: Date;
}

interface UserProfile {
  displayName: string;
  photoURL?: string;
}

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = auth.currentUser;

  const [selectedClip, setSelectedClip] = useState<'creator' | 'opponent' | null>(null);

  // Fetch challenge data
  const { data: challenge, isLoading, error } = useQuery({
    queryKey: ['challenge', id],
    queryFn: async () => {
      const challengeDoc = await getDoc(doc(db, 'challenges', id as string));
      if (!challengeDoc.exists()) {
        throw new Error('Challenge not found');
      }
      return { id: challengeDoc.id, ...challengeDoc.data() } as Challenge;
    },
    enabled: !!id,
  });

  // Fetch user profiles for display names
  const { data: profiles } = useQuery({
    queryKey: ['challengeProfiles', challenge?.createdBy, challenge?.opponent],
    queryFn: async () => {
      if (!challenge) return {};
      const [creatorDoc, opponentDoc] = await Promise.all([
        getDoc(doc(db, 'users', challenge.createdBy)),
        getDoc(doc(db, 'users', challenge.opponent)),
      ]);
      return {
        [challenge.createdBy]: creatorDoc.data() as UserProfile || { displayName: 'Creator' },
        [challenge.opponent]: opponentDoc.data() as UserProfile || { displayName: 'Opponent' },
      };
    },
    enabled: !!challenge,
  });

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: async (votedFor: string) => {
      if (!currentUser || !challenge) return;

      // Update challenge with vote
      const challengeRef = doc(db, 'challenges', challenge.id);
      await updateDoc(challengeRef, {
        [`voting.votes.${currentUser.uid}`]: votedFor,
        updatedAt: new Date(),
      });
    },
    onSuccess: () => {
      showMessage({ message: 'Vote recorded!', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['challenge', id] });
    },
    onError: (error: Error) => {
      showMessage({ message: error.message || 'Failed to vote', type: 'danger' });
    },
  });

  const handleVote = useCallback(
    (votedFor: string) => {
      if (!currentUser) {
        showMessage({ message: 'Please sign in to vote', type: 'warning' });
        return;
      }

      if (challenge?.participants.includes(currentUser.uid)) {
        showMessage({ message: "You can't vote on your own challenge", type: 'warning' });
        return;
      }

      if (challenge?.voting?.votes[currentUser.uid]) {
        showMessage({ message: 'You already voted', type: 'info' });
        return;
      }

      Alert.alert('Confirm Vote', `Vote for ${profiles?.[votedFor]?.displayName || 'this skater'}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Vote', onPress: () => voteMutation.mutate(votedFor) },
      ]);
    },
    [currentUser, challenge, profiles, voteMutation]
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
      </View>
    );
  }

  if (error || !challenge) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle" size={48} color={SKATE.colors.blood} />
        <Text style={styles.errorText}>Challenge not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const creatorClip = challenge.clips[challenge.createdBy];
  const opponentClip = challenge.clips[challenge.opponent];
  const creatorName = profiles?.[challenge.createdBy]?.displayName || 'Creator';
  const opponentName = profiles?.[challenge.opponent]?.displayName || 'Opponent';

  const isParticipant = currentUser && challenge.participants.includes(currentUser.uid);
  const canVote = challenge.status === 'voting' && !isParticipant && currentUser;
  const hasVoted = currentUser && challenge.voting?.votes[currentUser.uid];
  const userVote = hasVoted ? challenge.voting?.votes[currentUser.uid] : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Challenge Status */}
      <View style={styles.statusBanner}>
        <Text style={styles.statusText}>
          {challenge.status === 'completed'
            ? `Winner: ${profiles?.[challenge.voting?.result?.winner || '']?.displayName || 'TBD'}`
            : challenge.status === 'voting'
            ? 'Voting Open!'
            : challenge.status === 'both_ready'
            ? 'Both Clips Ready'
            : `Status: ${challenge.status}`}
        </Text>
      </View>

      {/* Clips Comparison */}
      <View style={styles.clipsContainer}>
        {/* Creator Clip */}
        <View style={styles.clipSection}>
          <TouchableOpacity
            style={[
              styles.clipHeader,
              selectedClip === 'creator' && styles.clipHeaderSelected,
            ]}
            onPress={() => setSelectedClip(selectedClip === 'creator' ? null : 'creator')}
          >
            <Text style={styles.clipName}>{creatorName}</Text>
            {challenge.status === 'completed' &&
              challenge.voting?.result?.winner === challenge.createdBy && (
                <Ionicons name="trophy" size={20} color={SKATE.colors.gold} />
              )}
          </TouchableOpacity>

          {creatorClip?.videoUrl && creatorClip.status === 'ready' ? (
            <VideoPlayer
              uri={creatorClip.videoUrl}
              posterUri={creatorClip.thumbnailUrl}
              autoPlay={selectedClip === 'creator'}
              style={styles.videoPlayer}
            />
          ) : (
            <View style={styles.pendingClip}>
              <Ionicons name="hourglass" size={32} color={SKATE.colors.gray} />
              <Text style={styles.pendingText}>
                {creatorClip ? 'Processing...' : 'Waiting for clip'}
              </Text>
            </View>
          )}

          {canVote && !hasVoted && (
            <TouchableOpacity
              style={styles.voteButton}
              onPress={() => handleVote(challenge.createdBy)}
              disabled={voteMutation.isPending}
            >
              <Ionicons name="heart" size={20} color={SKATE.colors.white} />
              <Text style={styles.voteButtonText}>Vote</Text>
            </TouchableOpacity>
          )}

          {userVote === challenge.createdBy && (
            <View style={styles.votedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={SKATE.colors.neon} />
              <Text style={styles.votedText}>Your Vote</Text>
            </View>
          )}
        </View>

        {/* VS Divider */}
        <View style={styles.vsDivider}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        {/* Opponent Clip */}
        <View style={styles.clipSection}>
          <TouchableOpacity
            style={[
              styles.clipHeader,
              selectedClip === 'opponent' && styles.clipHeaderSelected,
            ]}
            onPress={() => setSelectedClip(selectedClip === 'opponent' ? null : 'opponent')}
          >
            <Text style={styles.clipName}>{opponentName}</Text>
            {challenge.status === 'completed' &&
              challenge.voting?.result?.winner === challenge.opponent && (
                <Ionicons name="trophy" size={20} color={SKATE.colors.gold} />
              )}
          </TouchableOpacity>

          {opponentClip?.videoUrl && opponentClip.status === 'ready' ? (
            <VideoPlayer
              uri={opponentClip.videoUrl}
              posterUri={opponentClip.thumbnailUrl}
              autoPlay={selectedClip === 'opponent'}
              style={styles.videoPlayer}
            />
          ) : (
            <View style={styles.pendingClip}>
              <Ionicons name="hourglass" size={32} color={SKATE.colors.gray} />
              <Text style={styles.pendingText}>
                {opponentClip ? 'Processing...' : 'Waiting for clip'}
              </Text>
            </View>
          )}

          {canVote && !hasVoted && (
            <TouchableOpacity
              style={styles.voteButton}
              onPress={() => handleVote(challenge.opponent)}
              disabled={voteMutation.isPending}
            >
              <Ionicons name="heart" size={20} color={SKATE.colors.white} />
              <Text style={styles.voteButtonText}>Vote</Text>
            </TouchableOpacity>
          )}

          {userVote === challenge.opponent && (
            <View style={styles.votedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={SKATE.colors.neon} />
              <Text style={styles.votedText}>Your Vote</Text>
            </View>
          )}
        </View>
      </View>

      {/* Results (if completed) */}
      {challenge.status === 'completed' && challenge.voting?.result && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>Final Results</Text>
          <View style={styles.resultsRow}>
            <View style={styles.resultItem}>
              <Text style={styles.resultName}>{creatorName}</Text>
              <Text style={styles.resultVotes}>{challenge.voting.result.creatorVotes} votes</Text>
            </View>
            <View style={styles.resultItem}>
              <Text style={styles.resultName}>{opponentName}</Text>
              <Text style={styles.resultVotes}>{challenge.voting.result.opponentVotes} votes</Text>
            </View>
          </View>
        </View>
      )}

      {/* Actions for participants */}
      {isParticipant && challenge.status === 'creator_ready' && currentUser?.uid === challenge.opponent && (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push(`/challenge/new?opponentUid=${challenge.createdBy}&challengeId=${challenge.id}` as never)}
        >
          <Text style={styles.actionButtonText}>Accept Challenge</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  content: {
    padding: SKATE.spacing.lg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: SKATE.colors.ink,
  },
  errorText: {
    color: SKATE.colors.white,
    fontSize: 16,
    marginTop: SKATE.spacing.md,
  },
  backButton: {
    marginTop: SKATE.spacing.lg,
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.md,
  },
  backButtonText: {
    color: SKATE.colors.white,
    fontWeight: 'bold',
  },
  statusBanner: {
    backgroundColor: SKATE.colors.orange,
    padding: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    marginBottom: SKATE.spacing.lg,
    alignItems: 'center',
  },
  statusText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  clipsContainer: {
    gap: SKATE.spacing.md,
  },
  clipSection: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.md,
    overflow: 'hidden',
  },
  clipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SKATE.spacing.md,
    backgroundColor: SKATE.colors.ink,
  },
  clipHeaderSelected: {
    backgroundColor: SKATE.colors.orange,
  },
  clipName: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  videoPlayer: {
    margin: SKATE.spacing.sm,
  },
  pendingClip: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingText: {
    color: SKATE.colors.gray,
    marginTop: SKATE.spacing.sm,
  },
  voteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.blood,
    padding: SKATE.spacing.md,
    margin: SKATE.spacing.sm,
    borderRadius: SKATE.borderRadius.md,
  },
  voteButtonText: {
    color: SKATE.colors.white,
    fontWeight: 'bold',
  },
  votedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SKATE.spacing.xs,
    padding: SKATE.spacing.sm,
  },
  votedText: {
    color: SKATE.colors.neon,
    fontSize: 12,
  },
  vsDivider: {
    alignItems: 'center',
    paddingVertical: SKATE.spacing.sm,
  },
  vsText: {
    color: SKATE.colors.orange,
    fontSize: 24,
    fontWeight: 'bold',
  },
  resultsContainer: {
    marginTop: SKATE.spacing.xl,
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
  },
  resultsTitle: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SKATE.spacing.md,
    textAlign: 'center',
  },
  resultsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  resultItem: {
    alignItems: 'center',
  },
  resultName: {
    color: SKATE.colors.white,
    fontSize: 14,
    marginBottom: SKATE.spacing.xs,
  },
  resultVotes: {
    color: SKATE.colors.orange,
    fontSize: 20,
    fontWeight: 'bold',
  },
  actionButton: {
    backgroundColor: SKATE.colors.orange,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    marginTop: SKATE.spacing.xl,
    alignItems: 'center',
  },
  actionButtonText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
