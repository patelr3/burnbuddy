import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { useAuth } from '../lib/auth-context';
import { apiGet, apiPut, apiDelete } from '../lib/api';
import { Avatar } from '../components/Avatar';
import type { BurnSquad, GroupWorkout, WorkoutSchedule } from '@burnbuddy/shared';

interface Props {
  squadId: string;
  onBack: () => void;
}

interface MemberProfile {
  uid: string;
  displayName: string;
  email: string;
  profilePictureUrl?: string;
}

interface Streaks {
  burnStreak: number;
  supernovaStreak: number;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = (typeof DAYS)[number];

function squadAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'Today';
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

export default function BurnSquadDetailScreen({ squadId, onBack }: Props) {
  const { user } = useAuth();
  const [squad, setSquad] = useState<BurnSquad | null>(null);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [streaks, setStreaks] = useState<Streaks>({ burnStreak: 0, supernovaStreak: 0 });
  const [groupWorkouts, setGroupWorkouts] = useState<GroupWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit settings state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [onlyAdminsCanAdd, setOnlyAdminsCanAdd] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Day[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [timeError, setTimeError] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const squadData = await apiGet<BurnSquad>(`/burn-squads/${squadId}`);
      setSquad(squadData);
      setEditName(squadData.name);
      setOnlyAdminsCanAdd(squadData.settings.onlyAdminsCanAddMembers);
      if (squadData.settings.workoutSchedule) {
        setSelectedDays((squadData.settings.workoutSchedule.days as Day[]) ?? []);
        setScheduleTime(squadData.settings.workoutSchedule.time ?? '');
      }

      const [memberProfiles, streakData, allGroupWorkouts] = await Promise.all([
        Promise.all(
          squadData.memberUids.map((uid) =>
            apiGet<MemberProfile>(`/users/${uid}`).catch(() => ({
              uid,
              displayName: uid,
              email: '',
            })),
          ),
        ),
        apiGet<Streaks>(`/burn-squads/${squadId}/streaks`).catch(() => ({
          burnStreak: 0,
          supernovaStreak: 0,
        })),
        apiGet<GroupWorkout[]>('/group-workouts').catch(() => [] as GroupWorkout[]),
      ]);

      setMembers(memberProfiles);
      setStreaks(streakData);

      const squadWorkouts = allGroupWorkouts
        .filter((gw) => gw.type === 'squad' && gw.referenceId === squadId)
        .sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1));
      setGroupWorkouts(squadWorkouts);
    } catch {
      setError('Failed to load Burn Squad details');
    } finally {
      setLoading(false);
    }
  }, [squadId, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleDay = (day: Day) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const canSaveSettings = editName.trim() !== '' && (selectedDays.length === 0 || scheduleTime.trim() !== '');

  const handleSaveSettings = async () => {
    if (selectedDays.length > 0 && !scheduleTime.trim()) {
      setTimeError(true);
      return;
    }
    setSaving(true);
    setTimeError(false);
    try {
      const workoutSchedule: WorkoutSchedule | undefined =
        selectedDays.length > 0
          ? { days: selectedDays, time: scheduleTime.trim() }
          : undefined;
      const updated = await apiPut<BurnSquad>(`/burn-squads/${squadId}`, {
        name: editName,
        settings: {
          onlyAdminsCanAddMembers: onlyAdminsCanAdd,
          ...(workoutSchedule !== undefined && { workoutSchedule }),
        },
      });
      setSquad(updated);
      setEditing(false);
    } catch {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!squad) return;
    Alert.alert(
      'Delete Squad',
      `Are you sure you want to delete "${squad.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiDelete(`/burn-squads/${squadId}`);
              onBack();
            } catch {
              Alert.alert('Error', 'Failed to delete squad');
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (error || !squad) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.headerSide}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Burn Squad</Text>
          <View style={styles.headerSide} />
        </View>
        <Text style={styles.errorText}>{error ?? 'Squad not found'}</Text>
      </View>
    );
  }

  const isAdmin = squad.adminUid === user?.uid;
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
        <Text style={styles.headerTitle}>{squad.name}</Text>
        <View style={styles.headerSide}>
          {isAdmin && (
            <TouchableOpacity onPress={() => setEditing((e) => !e)}>
              <Text style={styles.editText}>{editing ? 'Done' : 'Edit'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Burn Squad</Text>
        </View>

        {/* Schedule display */}
        {!editing && squad.settings.workoutSchedule && squad.settings.workoutSchedule.days.length > 0 && (
          <View style={styles.scheduleRow}>
            <Text style={styles.scheduleText}>
              Schedule: {squad.settings.workoutSchedule.days.join(', ')}
              {squad.settings.workoutSchedule.time && ` at ${squad.settings.workoutSchedule.time}`}
            </Text>
          </View>
        )}

        {/* Admin settings panel */}
        {editing && isAdmin && (
          <View style={styles.settingsPanel}>
            <Text style={styles.settingsPanelTitle}>Squad Settings</Text>

            <Text style={styles.settingsLabel}>Squad Name</Text>
            <TextInput
              style={styles.settingsInput}
              value={editName}
              onChangeText={setEditName}
              placeholderTextColor="#9ca3af"
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Only admins can add members</Text>
              <Switch
                value={onlyAdminsCanAdd}
                onValueChange={setOnlyAdminsCanAdd}
                trackColor={{ true: '#8b5cf6' }}
              />
            </View>

            <Text style={styles.settingsLabel}>Workout Schedule</Text>
            <View style={styles.daysRow}>
              {DAYS.map((day) => (
                <TouchableOpacity
                  key={day}
                  onPress={() => toggleDay(day)}
                  style={[styles.dayButton, selectedDays.includes(day) && styles.dayButtonOn]}
                >
                  <Text
                    style={[
                      styles.dayButtonText,
                      selectedDays.includes(day) && styles.dayButtonTextOn,
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedDays.length > 0 && (
              <>
                <View style={styles.timeRow}>
                  <Text style={styles.timeLabel}>Time:</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={scheduleTime}
                    onChangeText={(t) => { setScheduleTime(t); setTimeError(false); }}
                    placeholder="HH:MM"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                {timeError && (
                  <Text style={styles.timeErrorText}>Please select a workout time</Text>
                )}
              </>
            )}

            <View style={styles.settingsActions}>
              <TouchableOpacity
                onPress={handleSaveSettings}
                disabled={saving || !canSaveSettings}
                style={[
                  styles.saveButton,
                  (saving || !canSaveSettings) && styles.disabledButton,
                ]}
              >
                <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Settings'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                disabled={deleting}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteButtonText}>
                  {deleting ? 'Deleting…' : 'Delete Squad'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
            <Text style={styles.statValue}>{squadAge(squad.createdAt)}</Text>
            <Text style={styles.statLabel}>Squad Age</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatDate(squad.createdAt)}</Text>
            <Text style={styles.statLabel}>Since</Text>
          </View>
        </View>

        {/* Member List */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Members ({squad.memberUids.length})</Text>
          {members.map((member) => (
            <View key={member.uid} style={styles.memberRow}>
              <View style={styles.memberAvatarWrapper}>
                <Avatar
                  displayName={member.displayName}
                  profilePictureUrl={member.profilePictureUrl}
                  size="sm"
                />
              </View>
              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                  {member.uid === squad.adminUid && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.memberEmail}>{member.email}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Group Workout Log */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Group Workout Log</Text>
          {groupWorkouts.length === 0 ? (
            <Text style={styles.emptyText}>No group workouts yet. Start one together!</Text>
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
  editText: { color: '#8b5cf6', fontSize: 15, textAlign: 'right' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333', flex: 1, textAlign: 'center' },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  errorText: { color: '#ef4444', margin: 16 },
  badge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  badgeText: { fontSize: 12, color: '#5b21b6', fontWeight: '600' },
  scheduleRow: {
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
  },
  scheduleText: { fontSize: 13, color: '#5b21b6' },
  settingsPanel: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#f8fafc',
    marginBottom: 20,
  },
  settingsPanelTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 14 },
  settingsLabel: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  settingsInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fff',
    marginBottom: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  switchLabel: { fontSize: 13, color: '#374151', flex: 1, marginRight: 8 },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  dayButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  dayButtonOn: {
    borderColor: '#8b5cf6',
    backgroundColor: '#f5f3ff',
  },
  dayButtonText: { fontSize: 12, color: '#374151' },
  dayButtonTextOn: { color: '#5b21b6' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  timeLabel: { fontSize: 13, color: '#6b7280' },
  timeInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fff',
    minWidth: 80,
  },
  timeErrorText: { color: '#ef4444', fontSize: 12, marginBottom: 8 },
  settingsActions: { flexDirection: 'row', gap: 8 },
  saveButton: {
    flex: 1,
    backgroundColor: '#8b5cf6',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  disabledButton: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  deleteButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#dc2626',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  deleteButtonText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
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
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  memberAvatarWrapper: {
    marginRight: 12,
  },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontSize: 14, fontWeight: '500', color: '#333' },
  adminBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  adminBadgeText: { fontSize: 11, color: '#92400e', fontWeight: '500' },
  memberEmail: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
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
