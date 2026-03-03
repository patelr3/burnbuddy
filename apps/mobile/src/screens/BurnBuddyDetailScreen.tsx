import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../lib/auth-context';
import { apiGet } from '../lib/api';
import type { BurnBuddy, GroupWorkout } from '@burnbuddy/shared';

interface Props {
  buddyId: string;
  onBack: () => void;
}

interface Streaks {
  burnStreak: number;
  supernovaStreak: number;
}

function buddyAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''}`;
}

function startOfWeekUTC(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString();
}

function startOfMonthUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function BurnBuddyDetailScreen({ buddyId, onBack }: Props) {
  const { user } = useAuth();
  const [buddy, setBuddy] = useState<BurnBuddy | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [streaks, setStreaks] = useState<Streaks>({ burnStreak: 0, supernovaStreak: 0 });
  const [groupWorkouts, setGroupWorkouts] = useState<GroupWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [buddyData, streakData, allGroupWorkouts] = await Promise.all([
        apiGet<BurnBuddy>(`/burn-buddies/${buddyId}`),
        apiGet<Streaks>(`/burn-buddies/${buddyId}/streaks`),
        apiGet<GroupWorkout[]>('/group-workouts'),
      ]);

      setBuddy(buddyData);
      setStreaks(streakData);

      const buddyWorkouts = allGroupWorkouts
        .filter((gw) => gw.referenceId === buddyId && gw.type === 'buddy')
        .sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1));
      setGroupWorkouts(buddyWorkouts);

      const partnerUid = buddyData.uid1 === user.uid ? buddyData.uid2 : buddyData.uid1;
      const profile = await apiGet<{ displayName: string }>(`/users/${partnerUid}`).catch(() => ({
        displayName: partnerUid,
      }));
      setPartnerName(profile.displayName);
    } catch {
      setError('Failed to load Burn Buddy details');
    } finally {
      setLoading(false);
    }
  }, [buddyId, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E05A00" />
      </View>
    );
  }

  if (error || !buddy) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.headerSide}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Burn Buddy</Text>
          <View style={styles.headerSide} />
        </View>
        <Text style={styles.errorText}>{error ?? 'Buddy not found'}</Text>
      </View>
    );
  }

  const weekStart = startOfWeekUTC();
  const monthStart = startOfMonthUTC();
  const workoutsThisWeek = groupWorkouts.filter((gw) => gw.startedAt >= weekStart).length;
  const workoutsThisMonth = groupWorkouts.filter((gw) => gw.startedAt >= monthStart).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerSide}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{partnerName}</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Burn Buddy</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>🔥 {streaks.burnStreak}</Text>
            <Text style={styles.statLabel}>Burn Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>⭐ {streaks.supernovaStreak}</Text>
            <Text style={styles.statLabel}>Supernova Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{workoutsThisWeek}</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{workoutsThisMonth}</Text>
            <Text style={styles.statLabel}>This Month</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{buddyAge(buddy.createdAt)}</Text>
            <Text style={styles.statLabel}>Together</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatDate(buddy.createdAt)}</Text>
            <Text style={styles.statLabel}>Since</Text>
          </View>
        </View>

        {/* Group Workout Log */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Group Workout Log</Text>
          {groupWorkouts.length === 0 ? (
            <Text style={styles.emptyText}>No group workouts yet. Start a workout to begin!</Text>
          ) : (
            groupWorkouts.map((gw) => (
              <View key={gw.id} style={styles.workoutRow}>
                <Text style={styles.workoutDate}>{formatDate(gw.startedAt)}</Text>
                <Text style={styles.workoutTime}>{formatTime(gw.startedAt)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerSide: { minWidth: 70 },
  backText: { color: '#E05A00', fontSize: 15 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333', flex: 1, textAlign: 'center' },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  errorText: { color: '#ef4444', margin: 16 },
  badge: {
    backgroundColor: '#fff3e0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  badgeText: { fontSize: 12, color: '#E05A00', fontWeight: '600' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    width: '47%',
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  statLabel: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  workoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  workoutDate: { fontSize: 14, color: '#333', fontWeight: '500' },
  workoutTime: { fontSize: 14, color: '#9ca3af' },
  emptyText: { color: '#9ca3af', fontSize: 14 },
});
