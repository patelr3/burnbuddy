'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPost, apiPut, apiPatch } from '@/lib/api';
import { GettingStartedCard } from '@/components/GettingStartedCard';
import { NavBar } from '@/components/NavBar';
import Link from 'next/link';
import type { UserProfile, BurnBuddy, BurnSquad, GroupWorkout, BurnBuddyRequest, BurnSquadJoinRequest, Workout, WorkoutType, WorkoutSchedule, ActivePartnerWorkout } from '@burnbuddy/shared';

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
  workoutSchedule?: WorkoutSchedule;
  activePartnerStartedAt?: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function getNextWorkout(schedule?: WorkoutSchedule): string | null {
  if (!schedule || schedule.days.length === 0) return null;
  const now = new Date();
  const currentDayIndex = now.getDay(); // 0=Sun ... 6=Sat
  const currentDayName = DAY_NAMES[currentDayIndex];
  const [schedHour, schedMin] = schedule.time
    ? schedule.time.split(':').map(Number)
    : [0, 0];

  // Check today and next 7 days
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    const dayName = DAY_NAMES[candidate.getDay()];
    if (!schedule.days.includes(dayName as typeof schedule.days[number])) continue;

    if (offset === 0) {
      // Today: only show if the scheduled time hasn't passed
      if (schedule.time) {
        const scheduledToday = new Date(now);
        scheduledToday.setHours(schedHour, schedMin, 0, 0);
        if (now >= scheduledToday) continue;
      } else {
        continue; // No time set, skip today
      }
    }

    const timeStr = schedule.time
      ? new Date(2000, 0, 1, schedHour, schedMin).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';
    return `${dayName}${timeStr ? ' ' + timeStr : ''}`;
  }
  return null;
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
  const [groupWorkoutWindowMs, setGroupWorkoutWindowMs] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const [userProfile, buddies, squads, groupWorkouts, buddyRequests, squadRequests, workouts, partnerActiveData] = await Promise.all([
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
        apiGet<{ groupWorkoutWindowMs: number; activePartnerWorkouts: ActivePartnerWorkout[] }>(
          '/workouts/partner-active',
        ).catch(() => ({ groupWorkoutWindowMs: 0, activePartnerWorkouts: [] as ActivePartnerWorkout[] })),
      ]);

      setGroupWorkoutWindowMs(partnerActiveData.groupWorkoutWindowMs);
      const activePartnerMap = new Map<string, string>();
      for (const apw of partnerActiveData.activePartnerWorkouts) {
        activePartnerMap.set(apw.referenceId, apw.earliestStartedAt);
      }

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
          workoutSchedule: b.workoutSchedule,
          activePartnerStartedAt: activePartnerMap.get(b.id),
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
          workoutSchedule: s.settings?.workoutSchedule,
          activePartnerStartedAt: activePartnerMap.get(s.id),
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

  // Poll partner-active every 30 seconds (skip while user has an active workout)
  useEffect(() => {
    if (!user || activeWorkout) return;
    const poll = async () => {
      try {
        const data = await apiGet<{ groupWorkoutWindowMs: number; activePartnerWorkouts: ActivePartnerWorkout[] }>(
          '/workouts/partner-active',
        );
        setGroupWorkoutWindowMs(data.groupWorkoutWindowMs);
        const newMap = new Map<string, string>();
        for (const apw of data.activePartnerWorkouts) {
          newMap.set(apw.referenceId, apw.earliestStartedAt);
        }
        setItems((prev) =>
          prev.map((item) => ({
            ...item,
            activePartnerStartedAt: newMap.get(item.id),
          })),
        );
      } catch {
        // Non-fatal — keep existing state
      }
    };
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [user, activeWorkout]);

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
      <main className="mx-auto max-w-xl px-4">

      {showCard && <GettingStartedCard onDismiss={handleDismiss} />}

      {/* Active Workout Banner */}
      {activeWorkout && (
        <div className="mb-5 flex items-center justify-between rounded-lg border border-yellow-300 bg-yellow-100 px-4 py-3.5 shadow">
          <div>
            <div className="text-[15px] font-bold text-yellow-900">
              🔥 Active Workout: {activeWorkout.type}
            </div>
            <div className="mt-0.5 text-[13px] text-yellow-800">
              {formatElapsed(elapsed)}
            </div>
          </div>
          <button
            onClick={handleEndWorkout}
            className="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-red-700"
          >
            End Workout
          </button>
        </div>
      )}

      {/* Start Workout Button */}
      {!activeWorkout && (
        <div className="mb-6">
          <button
            onClick={() => setShowWorkoutSelector(true)}
            className="w-full cursor-pointer rounded-lg bg-orange-500 p-4 text-base font-semibold text-white hover:bg-orange-600"
          >
            🔥 Start Workout
          </button>
        </div>
      )}

      {/* Workout Type Selector */}
      {showWorkoutSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[90%] max-w-[400px] rounded-xl bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Choose Workout Type</h2>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {WORKOUT_TYPES.map((wt) => (
                <button
                  key={wt}
                  onClick={() => setSelectedType(wt)}
                  className={`cursor-pointer rounded-md border-2 px-2 py-3 text-sm ${
                    selectedType === wt
                      ? 'border-orange-500 bg-orange-50 font-bold text-orange-700'
                      : 'border-slate-200 bg-white font-normal text-gray-700 hover:border-gray-300'
                  }`}
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
                className="mb-4 box-border w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowWorkoutSelector(false);
                  setSelectedType('');
                  setCustomType('');
                }}
                className="cursor-pointer rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleStartWorkout}
                disabled={!selectedType || (selectedType === 'Custom' && !customType.trim())}
                className="cursor-pointer rounded-md bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                Start Workout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Burn Buddy Requests */}
      {incomingBuddyRequests.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-base text-gray-500">
            Pending Burn Buddy Requests
          </h2>
          {incomingBuddyRequests.map((req) => (
            <div
              key={req.id}
              className="mb-2 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3"
            >
              <div>
                <strong>{req.displayName ?? req.fromUid}</strong>
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  wants to be your Burn Buddy
                </span>
              </div>
              <button
                onClick={() => handleAcceptBuddyRequest(req.id)}
                className="cursor-pointer rounded bg-orange-500 px-3.5 py-1.5 text-[13px] text-white hover:bg-orange-600"
              >
                Accept
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Pending Burn Squad Join Requests */}
      {incomingSquadRequests.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-base text-gray-500">
            Pending Squad Invitations
          </h2>
          {incomingSquadRequests.map((req) => (
            <div
              key={req.id}
              className="mb-2 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-3"
            >
              <div>
                <strong>{req.squadName}</strong>
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                  squad invitation
                </span>
              </div>
              <button
                onClick={() => handleAcceptSquadRequest(req.squadId, req.id)}
                className="cursor-pointer rounded bg-blue-500 px-3.5 py-1.5 text-[13px] text-white hover:bg-blue-600"
              >
                Accept
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Header with create buttons */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold">Burn Buddies &amp; Squads</h2>
        <div className="flex gap-2">
          <Link
            href="/burn-buddies/new"
            className="rounded bg-green-500 px-3.5 py-2 text-[13px] text-white no-underline hover:bg-green-600"
          >
            + Burn Buddy
          </Link>
          <Link
            href="/burn-squads/new"
            className="rounded bg-blue-500 px-3.5 py-2 text-[13px] text-white no-underline hover:bg-blue-600"
          >
            + Burn Squad
          </Link>
        </div>
      </div>

      {/* Combined list */}
      {dataLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400">
          No Burn Buddies or Burn Squads yet. Create one above!
        </p>
      ) : (
        <div>
          {items.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              href={`/${item.type === 'buddy' ? 'burn-buddies' : 'burn-squads'}/${item.id}`}
              className="block no-underline text-inherit"
            >
              <div className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-100 p-3.5 shadow-sm hover:bg-gray-50 mb-2">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <strong>{item.name}</strong>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        item.type === 'buddy'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {item.type === 'buddy' ? 'Buddy' : 'Squad'}
                    </span>
                  </div>
                  <div className="text-[13px] text-gray-500">
                    {timeAgo(item.lastGroupWorkout)}
                  </div>
                  {(() => {
                    const next = getNextWorkout(item.workoutSchedule);
                    return next ? (
                      <div className="mt-0.5 text-[12px] text-gray-400">
                        Next: {next}
                      </div>
                    ) : null;
                  })()}
                </div>
                <div className="text-right">
                  <div className="text-[22px] font-bold text-orange-500">
                    🔥{item.burnStreak}
                  </div>
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
