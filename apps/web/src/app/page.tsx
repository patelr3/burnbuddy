'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { useDashboard, queryKeys, type DashboardData } from '@/lib/queries';
import { apiPost, apiPut, apiPatch } from '@/lib/api';
import { GettingStartedCard } from '@/components/GettingStartedCard';
import { NavBar } from '@/components/NavBar';
import Link from 'next/link';
import type { Workout, WorkoutType, WorkoutSchedule } from '@burnbuddy/shared';

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

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  const [schedHour, schedMin] = schedule.time
    ? schedule.time.split(':').map(Number)
    : [0, 0];

  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    const dayName = DAY_NAMES[candidate.getDay()];
    if (!schedule.days.includes(dayName as typeof schedule.days[number])) continue;

    if (offset === 0) {
      if (schedule.time) {
        const scheduledToday = new Date(now);
        scheduledToday.setHours(schedHour, schedMin, 0, 0);
        if (now >= scheduledToday) continue;
      } else {
        continue;
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

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-14 rounded-lg bg-gray-200" />
      <div className="mb-6 flex items-center justify-between">
        <div className="h-6 w-48 rounded bg-gray-200" />
        <div className="flex gap-2">
          <div className="h-8 w-24 rounded bg-gray-200" />
          <div className="h-8 w-24 rounded bg-gray-200" />
        </div>
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-2 flex items-center justify-between rounded-lg border border-slate-100 p-3.5">
          <div>
            <div className="mb-2 h-5 w-32 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
          </div>
          <div className="h-8 w-12 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const { data: dashboard, isLoading: dataLoading } = useDashboard({ enabled: !!user });
  const queryClient = useQueryClient();

  // UI-only state
  const [showCardDismissed, setShowCardDismissed] = useState(false);
  const [showWorkoutSelector, setShowWorkoutSelector] = useState(false);
  const [selectedType, setSelectedType] = useState<WorkoutType | ''>('');
  const [customType, setCustomType] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  // Derived state from dashboard data
  const profile = dashboard?.user ?? null;
  const activeWorkout = dashboard?.activeWorkout ?? null;
  const showCard = profile ? !profile.gettingStartedDismissed && !showCardDismissed : false;
  const groupWorkoutWindowMs = dashboard?.partnerActivity?.groupWorkoutWindowMs ?? 0;
  const incomingBuddyRequests = dashboard?.buddyRequests?.incoming ?? [];
  const incomingSquadRequests = dashboard?.squadJoinRequests?.incoming ?? [];

  // Derive combined buddy/squad list from dashboard data
  const items = useMemo((): CombinedItem[] => {
    if (!dashboard || !user) return [];

    const activePartnerMap = new Map<string, string>();
    for (const apw of dashboard.partnerActivity.activePartnerWorkouts) {
      activePartnerMap.set(apw.referenceId, apw.earliestStartedAt);
    }

    const lastWorkoutMap = new Map<string, string>();
    for (const gw of dashboard.groupWorkouts) {
      const existing = lastWorkoutMap.get(gw.referenceId);
      if (!existing || gw.startedAt > existing) {
        lastWorkoutMap.set(gw.referenceId, gw.startedAt);
      }
    }

    const buddyItems: CombinedItem[] = dashboard.burnBuddies.map((bb) => ({
      type: 'buddy',
      id: bb.id,
      name: bb.partnerDisplayName,
      burnStreak: bb.streaks.burnStreak,
      lastGroupWorkout: lastWorkoutMap.get(bb.id) ?? null,
      workoutSchedule: bb.workoutSchedule,
      activePartnerStartedAt: activePartnerMap.get(bb.id),
    }));

    const squadItems: CombinedItem[] = dashboard.burnSquads.map((sq) => ({
      type: 'squad',
      id: sq.id,
      name: sq.name,
      burnStreak: sq.streaks.burnStreak,
      lastGroupWorkout: lastWorkoutMap.get(sq.id) ?? null,
      workoutSchedule: sq.settings?.workoutSchedule,
      activePartnerStartedAt: activePartnerMap.get(sq.id),
    }));

    const combined = [...buddyItems, ...squadItems];
    combined.sort((a, b) => {
      if (a.lastGroupWorkout && b.lastGroupWorkout) {
        return b.lastGroupWorkout.localeCompare(a.lastGroupWorkout);
      }
      if (a.lastGroupWorkout) return -1;
      if (b.lastGroupWorkout) return 1;
      return 0;
    });

    return combined;
  }, [dashboard, user]);

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

  // Countdown timer: update every second for items with active partner workouts
  useEffect(() => {
    if (!groupWorkoutWindowMs) return;
    const tick = () => {
      const now = Date.now();
      const next: Record<string, number> = {};
      for (const item of items) {
        if (item.activePartnerStartedAt) {
          const remaining = new Date(item.activePartnerStartedAt).getTime() + groupWorkoutWindowMs - now;
          if (remaining > 0) {
            next[item.id] = remaining;
          }
        }
      }
      setCountdowns(next);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [items, groupWorkoutWindowMs]);

  const handleDismiss = async () => {
    setShowCardDismissed(true);
    try {
      await apiPut('/users/me', { gettingStartedDismissed: true });
    } catch {
      // Non-fatal — dismissed in UI even if API call fails
    }
  };

  const handleAcceptBuddyRequest = async (requestId: string) => {
    try {
      await apiPost(`/burn-buddies/requests/${requestId}/accept`);
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    } catch {
      // ignore
    }
  };

  const handleAcceptSquadRequest = async (squadId: string, requestId: string) => {
    try {
      await apiPost(`/burn-squads/${squadId}/join-requests/${requestId}/accept`);
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    } catch {
      // ignore
    }
  };

  const handleStartWorkout = async () => {
    const type = selectedType === 'Custom' ? customType.trim() : selectedType;
    if (!type) return;
    try {
      const workout = await apiPost<Workout>('/workouts', { type });
      // Optimistic update so the active workout banner appears immediately
      queryClient.setQueryData<DashboardData>(queryKeys.dashboard, (old) =>
        old ? { ...old, activeWorkout: workout } : old,
      );
      setShowWorkoutSelector(false);
      setSelectedType('');
      setCustomType('');
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    } catch {
      // ignore
    }
  };

  const handleEndWorkout = async () => {
    if (!activeWorkout) return;
    try {
      await apiPatch(`/workouts/${activeWorkout.id}/end`);
      // Optimistic update so the banner disappears immediately
      queryClient.setQueryData<DashboardData>(queryKeys.dashboard, (old) =>
        old ? { ...old, activeWorkout: null } : old,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
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
                <strong>{req.fromDisplayName ?? req.fromUid}</strong>
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
        <DashboardSkeleton />
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
                  {!activeWorkout && countdowns[item.id] != null && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setShowWorkoutSelector(true);
                        }}
                        className="cursor-pointer rounded bg-green-500 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-green-600"
                      >
                        Join Workout
                      </button>
                      <span className={`text-[13px] font-medium ${countdowns[item.id] < 300000 ? 'text-red-600' : 'text-gray-500'}`}>
                        {formatCountdown(countdowns[item.id])}
                      </span>
                    </div>
                  )}
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
