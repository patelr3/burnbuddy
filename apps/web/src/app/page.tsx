'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPost, apiPut, apiPatch } from '@/lib/api';
import { GettingStartedCard } from '@/components/GettingStartedCard';
import { NavBar } from '@/components/NavBar';
import Link from 'next/link';
import type { UserProfile, BurnBuddy, BurnSquad, GroupWorkout, BurnBuddyRequest, BurnSquadJoinRequest, Workout, WorkoutType } from '@burnbuddy/shared';

const WORKOUT_TYPES: WorkoutType[] = [
  'Weightlifting', 'Running', 'Cycling', 'Yoga', 'Barre', 'Swimming', 'HIIT', 'Custom',
];

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [items, setItems] = useState<CombinedItem[]>([]);
  const [incomingBuddyRequests, setIncomingBuddyRequests] = useState<EnrichedBurnBuddyRequest[]>([]);
  const [incomingSquadRequests, setIncomingSquadRequests] = useState<EnrichedSquadJoinRequest[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [showWorkoutSelector, setShowWorkoutSelector] = useState(false);
  const [selectedType, setSelectedType] = useState<WorkoutType | ''>('');
  const [customType, setCustomType] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const [userProfile, buddies, squads, groupWorkouts, buddyRequests, squadRequests, workouts] = await Promise.all([
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
        apiGet<Workout[]>('/workouts').catch(() => [] as Workout[]),
      ]);

      const active = workouts.find((w) => w.status === 'active') ?? null;
      setActiveWorkout(active);

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

  // Update elapsed time every second while a workout is active
  useEffect(() => {
    if (!activeWorkout) {
      setElapsed(0);
      return;
    }
    const startTime = new Date(activeWorkout.startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout]);

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

  const handleStartWorkout = async () => {
    const type = selectedType === 'Custom' ? customType.trim() : selectedType;
    if (!type) return;
    try {
      const workout = await apiPost<Workout>('/workouts', { type });
      setActiveWorkout(workout);
      setShowWorkoutSelector(false);
      setSelectedType('');
      setCustomType('');
    } catch {
      // ignore
    }
  };

  const handleEndWorkout = async () => {
    if (!activeWorkout) return;
    try {
      await apiPatch(`/workouts/${activeWorkout.id}/end`);
      setActiveWorkout(null);
    } catch {
      // ignore
    }
  };

  if (loading) return null;

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>

      {showCard && <GettingStartedCard onDismiss={handleDismiss} />}

      {/* Active Workout Banner */}
      {activeWorkout && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            marginBottom: 20,
            borderRadius: 8,
            backgroundColor: '#fef9c3',
            border: '1px solid #fde047',
          }}
        >
          <div>
            <div style={{ fontWeight: 'bold', fontSize: 15, color: '#713f12' }}>
              🔥 Active Workout: {activeWorkout.type}
            </div>
            <div style={{ fontSize: 13, color: '#854d0e', marginTop: 2 }}>
              {formatElapsed(elapsed)}
            </div>
          </div>
          <button
            onClick={handleEndWorkout}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 'bold',
              fontSize: 13,
            }}
          >
            End Workout
          </button>
        </div>
      )}

      {/* Start Workout Button */}
      {!activeWorkout && (
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => setShowWorkoutSelector(true)}
            style={{
              width: '100%',
              padding: '16px',
              cursor: 'pointer',
              backgroundColor: '#f97316',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontWeight: 'bold',
              fontSize: 16,
            }}
          >
            🔥 Start Workout
          </button>
        </div>
      )}

      {/* Workout Type Selector */}
      {showWorkoutSelector && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              padding: 24,
              width: '90%',
              maxWidth: 400,
            }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Choose Workout Type</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginBottom: 16,
              }}
            >
              {WORKOUT_TYPES.map((wt) => (
                <button
                  key={wt}
                  onClick={() => setSelectedType(wt)}
                  style={{
                    padding: '12px 8px',
                    cursor: 'pointer',
                    border: selectedType === wt ? '2px solid #f97316' : '2px solid #e2e8f0',
                    borderRadius: 6,
                    backgroundColor: selectedType === wt ? '#fff7ed' : 'white',
                    fontWeight: selectedType === wt ? 'bold' : 'normal',
                    fontSize: 14,
                    color: selectedType === wt ? '#c2410c' : '#374151',
                  }}
                >
                  {wt}
                </button>
              ))}
            </div>
            {selectedType === 'Custom' && (
              <input
                type="text"
                placeholder="Enter custom workout type"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  marginBottom: 16,
                  boxSizing: 'border-box',
                }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowWorkoutSelector(false);
                  setSelectedType('');
                  setCustomType('');
                }}
                style={{
                  padding: '10px 20px',
                  cursor: 'pointer',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  backgroundColor: 'white',
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleStartWorkout}
                disabled={!selectedType || (selectedType === 'Custom' && !customType.trim())}
                style={{
                  padding: '10px 20px',
                  cursor: 'pointer',
                  backgroundColor: '#f97316',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 'bold',
                  fontSize: 14,
                  opacity: (!selectedType || (selectedType === 'Custom' && !customType.trim())) ? 0.5 : 1,
                }}
              >
                Start Workout
              </button>
            </div>
          </div>
        </div>
      )}

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
    </>
  );
}
