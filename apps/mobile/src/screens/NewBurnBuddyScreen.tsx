import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../lib/auth-context';
import { apiGet, apiPost } from '../lib/api';

interface Friend {
  uid: string;
  displayName: string;
  email: string;
}

interface Props {
  onBack: () => void;
  onSuccess: () => void;
}

export default function NewBurnBuddyScreen({ onBack, onSuccess }: Props) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
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

  const handleSubmit = async () => {
    if (!selectedUid) return;
    setSubmitting(true);
    try {
      await apiPost('/burn-buddies/requests', { toUid: selectedUid });
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send request';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedFriend = friends.find((f) => f.uid === selectedUid);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerSide}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Burn Buddy</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.instructions}>Select a friend to send a Burn Buddy request.</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#E05A00" style={styles.loader} />
        ) : friends.length === 0 ? (
          <Text style={styles.emptyText}>
            You have no friends yet. Go to the Friends tab to add friends first!
          </Text>
        ) : (
          friends.map((friend) => {
            const selected = friend.uid === selectedUid;
            return (
              <TouchableOpacity
                key={friend.uid}
                onPress={() => setSelectedUid(selected ? null : friend.uid)}
                style={[styles.friendCard, selected && styles.selectedCard]}
              >
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{friend.displayName}</Text>
                  <Text style={styles.friendEmail}>{friend.email}</Text>
                </View>
                {selected && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {selectedFriend != null && (
        <View style={styles.confirmPanel}>
          <Text style={styles.confirmText}>
            Send Burn Buddy request to{' '}
            <Text style={styles.boldText}>{selectedFriend.displayName}</Text>?
          </Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.sendButton, submitting && styles.disabledButton]}
          >
            <Text style={styles.sendButtonText}>
              {submitting ? 'Sending…' : 'Send Request'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
  loader: { marginTop: 40 },
  instructions: { fontSize: 14, color: '#555', marginBottom: 16 },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  selectedCard: {
    borderColor: '#E05A00',
    backgroundColor: '#fff7f0',
  },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontWeight: '600', color: '#333' },
  friendEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  checkmark: { fontSize: 18, color: '#E05A00', fontWeight: '700' },
  emptyText: { color: '#9ca3af', fontSize: 14 },
  confirmPanel: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  confirmText: { fontSize: 14, color: '#333', marginBottom: 12 },
  boldText: { fontWeight: '700' },
  sendButton: {
    backgroundColor: '#E05A00',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: { opacity: 0.6 },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
