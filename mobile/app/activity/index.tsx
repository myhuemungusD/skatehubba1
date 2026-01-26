/**
 * Activity Feed Screen
 * Shows notification history and recent activity
 */

import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SKATE } from '@/theme';
import { useNotifications } from '@/hooks/useNotifications';
import {
  ReceivedNotification,
  NotificationType,
  NOTIFICATION_TITLES,
} from '@/services/notifications/types';
import { navigateToNotification } from '@/services/notifications/notificationHandler';

const NOTIFICATION_ICONS: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  challenge_received: 'videocam',
  opponent_uploaded: 'play-circle',
  voting_requested: 'thumbs-up',
  result_posted: 'trophy',
  new_follower: 'person-add',
  spot_nearby: 'location',
};

export default function ActivityScreen() {
  const router = useRouter();
  const { history, refreshHistory, markAllRead, unreadCount } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshHistory();
    setRefreshing(false);
  }, [refreshHistory]);

  const handleNotificationPress = useCallback((notification: ReceivedNotification) => {
    navigateToNotification(notification.data);
  }, []);

  const renderNotification = ({ item }: { item: ReceivedNotification }) => {
    const icon = NOTIFICATION_ICONS[item.type] || 'notifications';
    const timeAgo = getTimeAgo(new Date(item.receivedAt));

    return (
      <TouchableOpacity
        style={[styles.notificationItem, !item.read && styles.unreadItem]}
        onPress={() => handleNotificationPress(item)}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}. ${timeAgo}`}
      >
        <View style={[styles.iconContainer, !item.read && styles.unreadIcon]}>
          <Ionicons name={icon} size={24} color={SKATE.colors.white} />
        </View>
        <View style={styles.contentContainer}>
          <Text style={styles.notificationTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notificationBody} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.notificationTime}>{timeAgo}</Text>
        </View>
        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off" size={64} color={SKATE.colors.gray} />
      <Text style={styles.emptyText}>No notifications yet</Text>
      <Text style={styles.emptySubtext}>
        Your challenges, votes, and activity will appear here
      </Text>
    </View>
  );

  const renderHeader = () => {
    if (history.length === 0) return null;

    return (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        </Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAllRead}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={history}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmpty}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={SKATE.colors.orange}
            colors={[SKATE.colors.orange]}
          />
        }
      />
    </View>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  listContent: {
    flexGrow: 1,
    padding: SKATE.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.sm,
    marginBottom: SKATE.spacing.sm,
  },
  headerTitle: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  markAllRead: {
    color: SKATE.colors.orange,
    fontSize: 14,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.md,
    padding: SKATE.spacing.md,
    marginBottom: SKATE.spacing.sm,
  },
  unreadItem: {
    backgroundColor: 'rgba(255, 102, 0, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: SKATE.colors.orange,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SKATE.colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SKATE.spacing.md,
  },
  unreadIcon: {
    backgroundColor: SKATE.colors.orange,
  },
  contentContainer: {
    flex: 1,
  },
  notificationTitle: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  notificationBody: {
    color: SKATE.colors.paper,
    fontSize: 14,
    marginBottom: 4,
  },
  notificationTime: {
    color: SKATE.colors.gray,
    fontSize: 12,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: SKATE.colors.orange,
    marginLeft: SKATE.spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: '600',
    marginTop: SKATE.spacing.lg,
  },
  emptySubtext: {
    color: SKATE.colors.gray,
    fontSize: 14,
    textAlign: 'center',
    marginTop: SKATE.spacing.sm,
    paddingHorizontal: SKATE.spacing.xl,
  },
});
