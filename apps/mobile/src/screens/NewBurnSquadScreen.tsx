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
} from 'react-native';
import { useAuth } from '../lib/auth-context';
import { apiGet, apiPost } from '../lib/api';
import type { WorkoutSchedule } from '@burnbuddy/shared';

interface Friend {
  uid: string;
  displayName: string;
  email: string;
}

interface Props {
  onBack: () => void;
  onSuccess: () => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export default function NewBurnSquadScreen({ onBack, onSuccess }: Props) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [squadName, setSquadName] = useState('');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [scheduleDays, setScheduleDays] = useState<Set<string>>(new Set());
  const [scheduleTime, setScheduleTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiGet<Friend[]>('/friends');
      setFriends(data);
    } catch {
      setError('Failed to load friends');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  const toggleFriend = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleDay = (day: string) => {
    setScheduleDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!squadName.trim()) {
      setError('Squad name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: {
        name: string;
        inviteUids: string[];
        workoutSchedule?: WorkoutSchedule;
      } = {
        name: squadName.trim(),
        inviteUids: [...selectedUids],
      };
      if (scheduleDays.size > 0) {
        const schedule: WorkoutSchedule = {
          days: [...scheduleDays] as WorkoutSchedule['days'],
        };
        if (scheduleTime) schedule.time = scheduleTime;
        body.workoutSchedule = schedule;
      }
      await apiPost('/burn-squads', body);
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create Burn Squad';
      Alert.alert('Error', msg);
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerSide}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Burn Squad</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Squad Name */}
        <Text style={styles.fieldLabel}>Squad Name *</Text>
        <TextInput
          style={styles.textInput}
          value={squadName}
          onChangeText={setSquadName}
          placeholder="e.g. Morning Crew"
          placeholderTextColor="#9ca3af"
        />

        {/* Friends */}
        <Text style={styles.fieldLabel}>Invite Friends</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#3b82f6" style={styles.loader} />
        ) : friends.length === 0 ? (
          <Text style={styles.emptyText}>
            No friends yet. Go to the Friends tab to add friends first!
          </Text>
        ) : (
          friends.map((friend) => {
            const isSelected = selectedUids.has(friend.uid);
            return (
              <TouchableOpacity
                key={friend.uid}
                onPress={() => toggleFriend(friend.uid)}
                style={[styles.friendCard, isSelected && styles.selectedCard]}
              >
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{friend.displayName}</Text>
                  <Text style={styles.friendEmail}>{friend.email}</Text>
                </View>
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          })
        )}

        {/* Schedule */}
        <Text style={[styles.fieldLabel, styles.fieldLabelTop]}>Workout Schedule (optional)</Text>
        <View style={styles.daysRow}>
          {DAYS.map((day) => {
            const isOn = scheduleDays.has(day);
            return (
              <TouchableOpacity
                key={day}
                onPress={() => toggleDay(day)}
                style={[styles.dayButton, isOn && styles.dayButtonOn]}
              >
                <Text style={[styles.dayButtonText, isOn && styles.dayButtonTextOn]}>{day}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {scheduleDays.size > 0 && (
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Time (optional):</Text>
            <TextInput
              style={styles.timeInput}
              value={scheduleTime}
              onChangeText={setScheduleTime}
              placeholder="HH:MM"
              placeholderTextColor="#9ca3af"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity onPress={onBack} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || !squadName.trim()}
          style={[
            styles.submitButton,
            (submitting || !squadName.trim()) && styles.disabledButton,
          ]}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? 'Creating…' : 'Create Burn Squad'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
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
  errorText: { color: '#ef4444', marginBottom: 12 },
  loader: { marginTop: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  fieldLabelTop: { marginTop: 16 },
  textInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    marginBottom: 20,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  selectedCard: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontWeight: '600', color: '#333' },
  friendEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  checkmark: { fontSize: 18, color: '#3b82f6', fontWeight: '700' },
  emptyText: { color: '#9ca3af', fontSize: 14 },
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
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  dayButtonOn: {
    borderColor: '#3b82f6',
    backgroundColor: '#3b82f6',
  },
  dayButtonText: { fontSize: 13, color: '#374151' },
  dayButtonTextOn: { color: '#fff' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  timeLabel: { fontSize: 13, color: '#6b7280' },
  timeInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: '#333',
    minWidth: 80,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 14, color: '#374151' },
  submitButton: {
    flex: 2,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
