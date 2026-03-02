'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { GettingStartedCard } from '@/components/GettingStartedCard';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { UserProfile, BurnBuddy, BurnSquad, GroupWorkout, BurnBuddyRequest, BurnSquadJoinRequest } from '@burnbuddy/shared';

interface Streaks {
  burnStreak: number;
  supernovaStreak: number;
}

interface CombinedItem {
  type: 'buddy' | 'squad';
  id: string;
  name: string;
  burnStreak: number;
  lastGroupWorkout: string | null;
}

interface EnrichedBurnBuddyRequest extends BurnBuddyRequest {
  displayName?: string;
}

interface EnrichedSquadJoinRequest extends BurnSquadJoinRequest {
  squadName: string;
}

function timeAgo(isoString: string | null): string {
  if (!isoString) return 'No group workouts yet';
  const ms = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [items, setItems] = useState<CombinedItem[]>([]);
  const [incomingBuddyRequests, setIncomingBuddyRequests] = useState<EnrichedBurnBuddyRequest[]>([]);
  const [incomingSquadRequests, setIncomingSquadRequests] = useState<EnrichedSquadJoinRequest[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const [userProfile, buddies, squads, groupWorkouts, buddyRequests, squadRequests] = await Promise.all([
        apiGet<UserProfile>('/users/me').catch(() => null),
        apiGet<BurnBuddy[]>('/burn-buddies').catch(() => [] as BurnBuddy[]),
        apiGet<BurnSquad[]>('/burn-squads').catch(() => [] as BurnSquad[]),
        apiGet<GroupWorkout[]>('/group-workouts').catch(() => [] as GroupWorkout[]),
        apiGet<{ incoming: BurnBuddyRequest[]; outgoing: BurnBuddyRequest[] }>(
          '/burn-buddies/requests',
        ).catch(() => ({ incoming: [], outgoing: [] })),
        apiGet<{ incoming: EnrichedSquadJoinRequest[]; outgoing: EnrichedSquadJoinRequest[] }>(
          '/burn-squads/join-requests',
        ).catch(() => ({ incoming: [], outgoing: [] })),
      ]);

      if (userProfile) {
        setProfile(userProfile);
        setShowCard(!userProfile.gettingStartedDismissed);
      } else {
        setShowCard(true);
      }

      // Enrich incoming burn buddy requests with display names
      const enrichedIncoming = await Promise.all(
        buddyRequests.incoming.map(async (req): Promise<EnrichedBurnBuddyRequest> => {
          try {
            const p = await apiGet<{ uid: string; displayName: string; email: string }>(
              `/users/${req.fromUid}`,
            );
            return { ...req, displayName: p.displayName };
          } catch {
            return { ...req };
          }
        }),
      );
      setIncomingBuddyRequests(enrichedIncoming);
      setIncomingSquadRequests(squadRequests.incoming);

      // Build a map of referenceId -> most recent group workout startedAt
      const lastWorkoutMap = new Map<string, string>();
      for (const gw of groupWorkouts) {
        const existing = lastWorkoutMap.get(gw.referenceId);
        if (!existing || gw.startedAt > existing) {
          lastWorkoutMap.set(gw.referenceId, gw.startedAt);
        }
      }

      // Fetch partner profiles and streaks for each burn buddy in parallel
      const buddyPromises = buddies.map(async (b): Promise<CombinedItem> => {
        const partnerUid = b.uid1 === user.uid ? b.uid2 : b.uid1;
        const [partnerProfile, streaks] = await Promise.all([
          apiGet<{ uid: string; displayName: string; email: string }>(
            `/users/${partnerUid}`,
          ).catch(() => null),
          apiGet<Streaks>(`/burn-buddies/${b.id}/streaks`).catch(() => ({
            burnStreak: 0,
            supernovaStreak: 0,
          })),
        ]);
        return {
          type: 'buddy',
          id: b.id,
          name: partnerProfile?.displayName ?? partnerUid,
          burnStreak: streaks.burnStreak,
          lastGroupWorkout: lastWorkoutMap.get(b.id) ?? null,
        };
      });

      // Fetch streaks for each burn squad in parallel
      const squadPromises = squads.map(async (s): Promise<CombinedItem> => {
        const streaks = await apiGet<Streaks>(`/burn-squads/${s.id}/streaks`).catch(() => ({
          burnStreak: 0,
          supernovaStreak: 0,
        }));
        return {
          type: 'squad',
          id: s.id,
          name: s.name,
          burnStreak: streaks.burnStreak,
          lastGroupWorkout: lastWorkoutMap.get(s.id) ?? null,
        };
      });

      const combined = await Promise.all([...buddyPromises, ...squadPromises]);

      // Sort: items with lastGroupWorkout first (desc), then items without
      combined.sort((a, b) => {
        if (a.lastGroupWorkout && b.lastGroupWorkout) {
          return b.lastGroupWorkout.localeCompare(a.lastGroupWorkout);
        }
        if (a.lastGroupWorkout) return -1;
        if (b.lastGroupWorkout) return 1;
        return 0;
      });

      setItems(combined);
    } catch {
      // Keep empty state on error
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDismiss = async () => {
    setShowCard(false);
    try {
      await apiPut('/users/me', { gettingStartedDismissed: true });
      if (profile) setProfile({ ...profile, gettingStartedDismissed: true });
    } catch {
      // Non-fatal — dismissed in UI even if API call fails
    }
  };

  const handleAcceptBuddyRequest = async (requestId: string) => {
    try {
      await apiPost(`/burn-buddies/requests/${requestId}/accept`);
      await loadData();
    } catch {
      // ignore
    }
  };

  const handleAcceptSquadRequest = async (squadId: string, requestId: string) => {
    try {
      await apiPost(`/burn-squads/${squadId}/join-requests/${requestId}/accept`);
      await loadData();
    } catch {
      // ignore
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  if (loading) return null;

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>
      {/* Nav bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 0',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>BurnBuddy</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/friends" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
            Friends
          </Link>
          {user && (
            <button
              onClick={handleSignOut}
              style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
            >
              Sign out
            </button>
          )}
        </div>
      </div>

      {showCard && <GettingStartedCard onDismiss={handleDismiss} />}

      {/* Pending Burn Buddy Requests */}
      {incomingBuddyRequests.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, color: '#6b7280', marginBottom: 12 }}>
            Pending Burn Buddy Requests
          </h2>
          {incomingBuddyRequests.map((req) => (
            <div
              key={req.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                marginBottom: 8,
                borderRadius: 6,
                border: '1px solid #fde68a',
                backgroundColor: '#fffbeb',
              }}
            >
              <div>
                <strong>{req.displayName ?? req.fromUid}</strong>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    color: '#92400e',
                    backgroundColor: '#fef3c7',
                    padding: '2px 8px',
                    borderRadius: 12,
                  }}
                >
                  wants to be your Burn Buddy
                </span>
              </div>
              <button
                onClick={() => handleAcceptBuddyRequest(req.id)}
                style={{
                  padding: '6px 14px',
                  cursor: 'pointer',
                  backgroundColor: '#f97316',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              >
                Accept
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Pending Burn Squad Join Requests */}
      {incomingSquadRequests.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, color: '#6b7280', marginBottom: 12 }}>
            Pending Squad Invitations
          </h2>
          {incomingSquadRequests.map((req) => (
            <div
              key={req.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                marginBottom: 8,
                borderRadius: 6,
                border: '1px solid #bfdbfe',
                backgroundColor: '#eff6ff',
              }}
            >
              <div>
                <strong>{req.squadName}</strong>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    color: '#1e40af',
                    backgroundColor: '#dbeafe',
                    padding: '2px 8px',
                    borderRadius: 12,
                  }}
                >
                  squad invitation
                </span>
              </div>
              <button
                onClick={() => handleAcceptSquadRequest(req.squadId, req.id)}
                style={{
                  padding: '6px 14px',
                  cursor: 'pointer',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              >
                Accept
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Header with create buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Burn Buddies & Squads</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/burn-buddies/new"
            style={{
              padding: '8px 14px',
              fontSize: 13,
              cursor: 'pointer',
              backgroundColor: '#22c55e',
              color: 'white',
              borderRadius: 4,
              textDecoration: 'none',
            }}
          >
            + Burn Buddy
          </Link>
          <Link
            href="/burn-squads/new"
            style={{
              padding: '8px 14px',
              fontSize: 13,
              cursor: 'pointer',
              backgroundColor: '#3b82f6',
              color: 'white',
              borderRadius: 4,
              textDecoration: 'none',
            }}
          >
            + Burn Squad
          </Link>
        </div>
      </div>

      {/* Combined list */}
      {dataLoading ? (
        <p style={{ color: '#6b7280' }}>Loading...</p>
      ) : items.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>
          No Burn Buddies or Burn Squads yet. Create one above!
        </p>
      ) : (
        <div>
          {items.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              href={`/${item.type === 'buddy' ? 'burn-buddies' : 'burn-squads'}/${item.id}`}
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 0',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <strong>{item.name}</strong>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 7px',
                        borderRadius: 12,
                        backgroundColor: item.type === 'buddy' ? '#fef3c7' : '#dbeafe',
                        color: item.type === 'buddy' ? '#92400e' : '#1e40af',
                      }}
                    >
                      {item.type === 'buddy' ? 'Buddy' : 'Squad'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {timeAgo(item.lastGroupWorkout)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 'bold', color: '#f97316' }}>
                    {item.burnStreak}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>streak</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
