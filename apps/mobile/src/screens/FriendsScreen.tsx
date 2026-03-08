import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useAuth } from '../lib/auth-context';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { Avatar } from '../components/Avatar';
import type { FriendRequest } from '@burnbuddy/shared';

interface FriendWithProfile {
  uid: string;
  displayName: string;
  email: string;
  profilePictureUrl?: string;
  createdAt: string;
}

interface UserSearchResult {
  uid: string;
  displayName: string;
  email: string;
  profilePictureUrl?: string;
}

interface EnrichedFriendRequest extends FriendRequest {
  displayName?: string;
  profilePictureUrl?: string;
}

export default function FriendsScreen() {
  const { user } = useAuth();

  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [incoming, setIncoming] = useState<EnrichedFriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<EnrichedFriendRequest[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [showSearch, setShowSearch] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState<UserSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [confirmUser, setConfirmUser] = useState<UserSearchResult | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [friendsList, requests] = await Promise.all([
        apiGet<FriendWithProfile[]>('/friends'),
        apiGet<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/friends/requests'),
      ]);
      setFriends(friendsList);

      const enrichReq = async (
        req: FriendRequest,
        uidField: 'fromUid' | 'toUid',
      ): Promise<EnrichedFriendRequest> => {
        try {
          const profile = await apiGet<UserSearchResult>(`/users/${req[uidField]}`);
          return { ...req, displayName: profile.displayName, profilePictureUrl: profile.profilePictureUrl };
        } catch {
          return { ...req };
        }
      };

      const [enrichedIncoming, enrichedOutgoing] = await Promise.all([
        Promise.all(requests.incoming.map((r) => enrichReq(r, 'fromUid'))),
        Promise.all(requests.outgoing.map((r) => enrichReq(r, 'toUid'))),
      ]);

      setIncoming(enrichedIncoming);
      setOutgoing(enrichedOutgoing);
    } catch {
      setError('Failed to load friends');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadData();
  }, [user, loadData]);

  const handleSearch = async () => {
    if (!searchEmail.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const result = await apiGet<UserSearchResult>(
        `/users/search?email=${encodeURIComponent(searchEmail.trim())}`,
      );
      setSearchResult(result);
    } catch {
      setSearchError('No user found with that email address');
    } finally {
      setSearching(false);
    }
  };

  const handleConfirmRequest = async () => {
    if (!confirmUser) return;
    setSendingRequest(true);
    try {
      await apiPost('/friends/requests', { toUid: confirmUser.uid });
      setConfirmUser(null);
      setShowSearch(false);
      setSearchEmail('');
      setSearchResult(null);
      await loadData();
    } catch {
      Alert.alert('Error', 'Failed to send friend request');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await apiPost(`/friends/requests/${requestId}/accept`);
      await loadData();
    } catch {
      Alert.alert('Error', 'Failed to accept friend request');
    }
  };

  const handleRemoveFriend = (friend: FriendWithProfile) => {
    Alert.alert(
      'Remove Friend',
      `Remove ${friend.displayName} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiDelete(`/friends/${friend.uid}`);
              setFriends((prev) => prev.filter((f) => f.uid !== friend.uid));
            } catch {
              Alert.alert('Error', 'Failed to remove friend');
            }
          },
        },
      ],
    );
  };

  const closeSearch = () => {
    setShowSearch(false);
    setSearchEmail('');
    setSearchResult(null);
    setSearchError(null);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Friends</Text>
        <TouchableOpacity
          onPress={() => (showSearch ? closeSearch() : setShowSearch(true))}
          style={styles.addButton}
          testID="friends-add-friend-button"
        >
          <Text style={styles.addButtonText}>{showSearch ? 'Cancel' : '+ Add Friend'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Search Panel */}
        {showSearch && (
          <View style={styles.searchPanel}>
            <Text style={styles.sectionTitle}>Search by Email</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={searchEmail}
                onChangeText={setSearchEmail}
                placeholder="friend@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleSearch}
                testID="friends-search-input"
              />
              <TouchableOpacity
                onPress={handleSearch}
                disabled={searching}
                style={[styles.searchButton, searching && styles.disabledButton]}
                testID="friends-search-button"
              >
                <Text style={styles.searchButtonText}>{searching ? '…' : 'Search'}</Text>
              </TouchableOpacity>
            </View>
            {searchError && <Text style={styles.searchError}>{searchError}</Text>}
            {searchResult && (
              <TouchableOpacity
                onPress={() => setConfirmUser(searchResult)}
                style={styles.searchResultCard}
                testID="friends-search-result"
              >
                <View style={styles.searchResultRow}>
                  <Avatar
                    displayName={searchResult.displayName}
                    profilePictureUrl={searchResult.profilePictureUrl}
                    size="sm"
                  />
                  <View style={styles.searchResultInfo}>
                    <Text style={styles.searchResultName}>{searchResult.displayName}</Text>
                    <Text style={styles.searchResultEmail}>{searchResult.email}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {dataLoading ? (
          <ActivityIndicator size="large" color="#E05A00" style={styles.loader} />
        ) : (
          <>
            {/* Pending Requests */}
            {(incoming.length > 0 || outgoing.length > 0) && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Pending Requests</Text>
                {incoming.map((req) => (
                  <View key={req.id} style={styles.requestRow} testID={`friends-request-item-${req.id}`}>
                    <Avatar
                      displayName={req.displayName ?? req.fromUid}
                      profilePictureUrl={req.profilePictureUrl}
                      size="sm"
                    />
                    <View style={styles.requestInfo}>
                      <Text style={styles.requestName}>{req.displayName ?? req.fromUid}</Text>
                      <View style={styles.incomingBadge}>
                        <Text style={styles.incomingBadgeText}>incoming</Text>
                      </View>
                    </View>
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        onPress={() => handleAcceptRequest(req.id)}
                        style={styles.acceptButton}
                        testID={`friends-accept-button-${req.id}`}
                      >
                        <Text style={styles.acceptButtonText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.ignoreButton} testID={`friends-decline-button-${req.id}`}>
                        <Text style={styles.ignoreButtonText}>Ignore</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {outgoing.map((req) => (
                  <View key={req.id} style={styles.requestRow}>
                    <Avatar
                      displayName={req.displayName ?? req.toUid}
                      profilePictureUrl={req.profilePictureUrl}
                      size="sm"
                    />
                    <Text style={[styles.requestName, { marginLeft: 8 }]}>{req.displayName ?? req.toUid}</Text>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>pending</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Friends List */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                Friends{friends.length > 0 ? ` (${friends.length})` : ''}
              </Text>
              {friends.length === 0 ? (
                <Text style={styles.emptyText}>No friends yet. Add your first friend above!</Text>
              ) : (
                friends.map((friend) => (
                  <View key={friend.uid} style={styles.friendRow} testID={`friends-friend-item-${friend.uid}`}>
                    <Avatar
                      displayName={friend.displayName}
                      profilePictureUrl={friend.profilePictureUrl}
                      size="sm"
                    />
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{friend.displayName}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveFriend(friend)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal visible={confirmUser !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send Friend Request?</Text>
            <Text style={styles.modalBody}>
              Send a friend request to{' '}
              <Text style={styles.bold}>{confirmUser?.displayName}</Text>
              {'\n'}
              {confirmUser?.email}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setConfirmUser(null)}
                style={styles.cancelButton}
                testID="friends-modal-cancel-button"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmRequest}
                disabled={sendingRequest}
                style={[styles.confirmButton, sendingRequest && styles.disabledButton]}
                testID="friends-modal-send-button"
              >
                <Text style={styles.confirmButtonText}>
                  {sendingRequest ? 'Sending…' : 'Send Request'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  addButton: {
    backgroundColor: '#E05A00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  errorText: { color: '#ef4444', marginBottom: 12 },
  loader: { marginTop: 40 },

  searchPanel: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  searchButton: {
    backgroundColor: '#E05A00',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    justifyContent: 'center',
  },
  searchButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  searchError: { color: '#ef4444', fontSize: 13, marginTop: 6 },
  searchResultCard: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 12,
  },
  searchResultRow: { flexDirection: 'row', alignItems: 'center' },
  searchResultInfo: { marginLeft: 10, flex: 1 },
  searchResultName: { fontWeight: '600', fontSize: 15, color: '#333' },
  searchResultEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },

  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#9ca3af', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  requestInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  requestName: { fontSize: 15, fontWeight: '500', color: '#333' },
  requestActions: { flexDirection: 'row', gap: 6 },
  acceptButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 5,
  },
  acceptButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  ignoreButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 5,
  },
  ignoreButtonText: { color: '#6b7280', fontSize: 13 },
  incomingBadge: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  incomingBadgeText: { fontSize: 11, color: '#22c55e', fontWeight: '500' },
  pendingBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pendingBadgeText: { fontSize: 11, color: '#6b7280', fontWeight: '500' },

  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  friendInfo: { flex: 1, marginLeft: 10 },
  friendName: { fontSize: 15, fontWeight: '500', color: '#333' },
  removeButton: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  removeButtonText: { color: '#ef4444', fontSize: 13 },
  emptyText: { color: '#9ca3af', fontSize: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '85%',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 12 },
  modalBody: { fontSize: 14, color: '#555', lineHeight: 22, marginBottom: 20 },
  bold: { fontWeight: '700' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  cancelButtonText: { color: '#555', fontSize: 14 },
  confirmButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  confirmButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  disabledButton: { opacity: 0.6 },
});
