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
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { apiGet, apiPost, apiPut } from '../lib/api';
import GettingStartedCard from '../components/GettingStartedCard';
import BurnBuddyDetailScreen from './BurnBuddyDetailScreen';
import NewBurnBuddyScreen from './NewBurnBuddyScreen';
import type {
  UserProfile,
  BurnBuddy,
  BurnSquad,
  GroupWorkout,
  BurnBuddyRequest,
  BurnSquadJoinRequest,
} from '@burnbuddy/shared';

// ----- Types -----

interface EnrichedBurnBuddy extends BurnBuddy {
  partnerDisplayName: string;
  burnStreak: number;
  lastGroupWorkout?: string;
}

interface EnrichedBurnSquad extends BurnSquad {
  burnStreak: number;
  lastGroupWorkout?: string;
}

interface EnrichedBurnBuddyRequest extends BurnBuddyRequest {
  displayName?: string;
}

interface EnrichedSquadJoinRequest extends BurnSquadJoinRequest {
  squadName: string;
}

type HomeView =
  | { type: 'list' }
  | { type: 'buddy-detail'; buddyId: string }
  | { type: 'new-buddy' };

// ----- Helpers -----

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ----- HomeListView -----

interface HomeListViewProps {
  onNavigateToBuddyDetail: (id: string) => void;
  onNavigateToNewBuddy: () => void;
}

function HomeListView({ onNavigateToBuddyDetail, onNavigateToNewBuddy }: HomeListViewProps) {
  const { user } = useAuth();
  const [buddies, setBuddies] = useState<EnrichedBurnBuddy[]>([]);
  const [squads, setSquads] = useState<EnrichedBurnSquad[]>([]);
  const [incomingBuddyRequests, setIncomingBuddyRequests] = useState<EnrichedBurnBuddyRequest[]>([]);
  const [incomingSquadRequests, setIncomingSquadRequests] = useState<EnrichedSquadJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGettingStarted, setShowGettingStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [rawBuddies, rawSquads, groupWorkouts, profile, buddyRequests, squadJoinRequests] =
        await Promise.all([
          apiGet<BurnBuddy[]>('/burn-buddies'),
          apiGet<BurnSquad[]>('/burn-squads'),
          apiGet<GroupWorkout[]>('/group-workouts'),
          apiGet<UserProfile>('/users/me').catch(() => null),
          apiGet<{ incoming: BurnBuddyRequest[]; outgoing: BurnBuddyRequest[] }>(
            '/burn-buddies/requests',
          ).catch(() => ({ incoming: [], outgoing: [] })),
          apiGet<{ incoming: EnrichedSquadJoinRequest[]; outgoing: EnrichedSquadJoinRequest[] }>(
            '/burn-squads/join-requests',
          ).catch(() => ({ incoming: [], outgoing: [] })),
        ]);

      setShowGettingStarted(!profile?.gettingStartedDismissed);

      // Build lastGroupWorkout map: referenceId → most recent startedAt
      const lastGW = new Map<string, string>();
      for (const gw of groupWorkouts) {
        const current = lastGW.get(gw.referenceId);
        if (!current || gw.startedAt > current) {
          lastGW.set(gw.referenceId, gw.startedAt);
        }
      }

      // Enrich buddies with partner name and streaks
      const enrichedBuddies = await Promise.all(
        rawBuddies.map(async (buddy) => {
          const partnerUid = buddy.uid1 === user.uid ? buddy.uid2 : buddy.uid1;
          const [partnerProfile, streaks] = await Promise.all([
            apiGet<{ displayName: string }>(`/users/${partnerUid}`).catch(() => ({
              displayName: partnerUid,
            })),
            apiGet<{ burnStreak: number; supernovaStreak: number }>(
              `/burn-buddies/${buddy.id}/streaks`,
            ).catch(() => ({ burnStreak: 0, supernovaStreak: 0 })),
          ]);
          return {
            ...buddy,
            partnerDisplayName: partnerProfile.displayName,
            burnStreak: streaks.burnStreak,
            lastGroupWorkout: lastGW.get(buddy.id),
          };
        }),
      );

      // Enrich squads with streaks
      const enrichedSquads = await Promise.all(
        rawSquads.map(async (squad) => {
          const streaks = await apiGet<{ burnStreak: number; supernovaStreak: number }>(
            `/burn-squads/${squad.id}/streaks`,
          ).catch(() => ({ burnStreak: 0, supernovaStreak: 0 }));
          return {
            ...squad,
            burnStreak: streaks.burnStreak,
            lastGroupWorkout: lastGW.get(squad.id),
          };
        }),
      );

      setBuddies(enrichedBuddies);
      setSquads(enrichedSquads);

      // Enrich incoming buddy requests with sender display name
      const enrichedIncoming = await Promise.all(
        buddyRequests.incoming.map(async (req) => {
          try {
            const p = await apiGet<{ displayName: string }>(`/users/${req.fromUid}`);
            return { ...req, displayName: p.displayName };
          } catch {
            return { ...req };
          }
        }),
      );
      setIncomingBuddyRequests(enrichedIncoming);
      setIncomingSquadRequests(squadJoinRequests.incoming);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void loadData();
  }, [user, loadData]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      Alert.alert('Error', message);
    }
  };

  const handleDismissCard = () => {
    setShowGettingStarted(false);
    apiPut('/users/me', { gettingStartedDismissed: true }).catch(() => {});
  };

  const handleAcceptBuddyRequest = async (requestId: string) => {
    try {
      await apiPost(`/burn-buddies/requests/${requestId}/accept`);
      await loadData();
    } catch {
      Alert.alert('Error', 'Failed to accept Burn Buddy request');
    }
  };

  const handleAcceptSquadRequest = async (squadId: string, requestId: string) => {
    try {
      await apiPost(`/burn-squads/${squadId}/join-requests/${requestId}/accept`);
      await loadData();
    } catch {
      Alert.alert('Error', 'Failed to accept squad invitation');
    }
  };

  // Combined sorted list: most recent group workout first; no group workout → bottom
  type ListItem =
    | { type: 'buddy'; item: EnrichedBurnBuddy }
    | { type: 'squad'; item: EnrichedBurnSquad };

  const combined: ListItem[] = [
    ...buddies.map((b) => ({ type: 'buddy' as const, item: b })),
    ...squads.map((s) => ({ type: 'squad' as const, item: s })),
  ].sort((a, b) => {
    const aTime = a.item.lastGroupWorkout;
    const bTime = b.item.lastGroupWorkout;
    if (aTime && bTime) return bTime > aTime ? 1 : -1;
    if (aTime) return -1;
    if (bTime) return 1;
    return 0;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>buddyburn 🔥</Text>
        <TouchableOpacity onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        {showGettingStarted && <GettingStartedCard onDismiss={handleDismissCard} />}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={onNavigateToNewBuddy}>
            <Text style={styles.actionButtonText}>+ Burn Buddy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() =>
              Alert.alert('Coming Soon', 'Burn Squads are coming in the next update!')
            }
          >
            <Text style={styles.actionButtonTextSecondary}>+ Burn Squad</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#E05A00" style={styles.loader} />
        ) : (
          <>
            {/* Incoming Burn Buddy Requests */}
            {incomingBuddyRequests.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Burn Buddy Requests</Text>
                {incomingBuddyRequests.map((req) => (
                  <View key={req.id} style={styles.requestRow}>
                    <View style={styles.requestInfo}>
                      <Text style={styles.requestName}>{req.displayName ?? req.fromUid}</Text>
                      <Text style={styles.requestSub}>wants to be your Burn Buddy</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleAcceptBuddyRequest(req.id)}
                      style={styles.acceptButton}
                    >
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Incoming Squad Join Requests */}
            {incomingSquadRequests.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Squad Invitations</Text>
                {incomingSquadRequests.map((req) => (
                  <View key={req.id} style={styles.requestRow}>
                    <View style={styles.requestInfo}>
                      <Text style={styles.requestName}>{req.squadName}</Text>
                      <Text style={styles.requestSub}>invited to join</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleAcceptSquadRequest(req.squadId, req.id)}
                      style={[styles.acceptButton, styles.acceptButtonSquad]}
                    >
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Combined Sorted List */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {combined.length === 0
                  ? 'No buddies or squads yet'
                  : `Buddies & Squads (${combined.length})`}
              </Text>
              {combined.length === 0 ? (
                <Text style={styles.emptyText}>
                  Add friends and send Burn Buddy requests to get started!
                </Text>
              ) : (
                combined.map((entry) => {
                  if (entry.type === 'buddy') {
                    const buddy = entry.item;
                    return (
                      <TouchableOpacity
                        key={buddy.id}
                        style={styles.listCard}
                        onPress={() => onNavigateToBuddyDetail(buddy.id)}
                      >
                        <View style={styles.listCardLeft}>
                          <Text style={styles.listCardName}>{buddy.partnerDisplayName}</Text>
                          <View style={styles.listCardBadge}>
                            <Text style={styles.listCardBadgeText}>Burn Buddy</Text>
                          </View>
                        </View>
                        <View style={styles.listCardRight}>
                          <Text style={styles.streakText}>🔥 {buddy.burnStreak}</Text>
                          {buddy.lastGroupWorkout != null && (
                            <Text style={styles.timeAgoText}>
                              {timeAgo(buddy.lastGroupWorkout)}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  }
                  const squad = entry.item;
                  return (
                    <View key={squad.id} style={styles.listCard}>
                      <View style={styles.listCardLeft}>
                        <Text style={styles.listCardName}>{squad.name}</Text>
                        <View style={[styles.listCardBadge, styles.squadBadge]}>
                          <Text style={[styles.listCardBadgeText, styles.squadBadgeText]}>
                            Burn Squad
                          </Text>
                        </View>
                      </View>
                      <View style={styles.listCardRight}>
                        <Text style={styles.streakText}>🔥 {squad.burnStreak}</Text>
                        {squad.lastGroupWorkout != null && (
                          <Text style={styles.timeAgoText}>{timeAgo(squad.lastGroupWorkout)}</Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ----- HomeScreen (view router) -----

export default function HomeScreen() {
  const [view, setView] = useState<HomeView>({ type: 'list' });

  if (view.type === 'buddy-detail') {
    return (
      <BurnBuddyDetailScreen
        buddyId={view.buddyId}
        onBack={() => setView({ type: 'list' })}
      />
    );
  }

  if (view.type === 'new-buddy') {
    return (
      <NewBurnBuddyScreen
        onBack={() => setView({ type: 'list' })}
        onSuccess={() => setView({ type: 'list' })}
      />
    );
  }

  return (
    <HomeListView
      onNavigateToBuddyDetail={(id) => setView({ type: 'buddy-detail', buddyId: id })}
      onNavigateToNewBuddy={() => setView({ type: 'new-buddy' })}
    />
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
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#E05A00' },
  signOutText: { color: '#E05A00', fontSize: 14 },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  errorText: { color: '#ef4444', marginBottom: 12 },
  loader: { marginTop: 40 },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#E05A00',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E05A00',
  },
  actionButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  actionButtonTextSecondary: { color: '#E05A00', fontWeight: '600', fontSize: 14 },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  requestInfo: { flex: 1, marginRight: 10 },
  requestName: { fontSize: 15, fontWeight: '500', color: '#333' },
  requestSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  acceptButton: {
    backgroundColor: '#E05A00',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  acceptButtonSquad: { backgroundColor: '#3b82f6' },
  acceptButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  listCardLeft: { flex: 1 },
  listCardName: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  listCardBadge: {
    backgroundColor: '#fff3e0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  squadBadge: { backgroundColor: '#eff6ff' },
  listCardBadgeText: { fontSize: 11, color: '#E05A00', fontWeight: '500' },
  squadBadgeText: { color: '#3b82f6' },
  listCardRight: { alignItems: 'flex-end' },
  streakText: { fontSize: 16, fontWeight: '700', color: '#E05A00' },
  timeAgoText: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  emptyText: { color: '#9ca3af', fontSize: 14 },
});
