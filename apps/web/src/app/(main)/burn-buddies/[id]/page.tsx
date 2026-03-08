'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiPut } from '@/lib/api';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { StatCard } from '@/components/StatCard';
import { StreakDots } from '@/components/StreakDots';
import { Avatar } from '@/components/Avatar';
import { AddToCalendarButton } from '@/components/AddToCalendarButton';
import { useBurnBuddy, queryKeys } from '@/lib/queries';
import type { BurnBuddyData } from '@/lib/queries';
import type { BurnBuddy, WorkoutSchedule } from '@burnbuddy/shared';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = (typeof DAYS)[number];

function timeAgo(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buddyAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month';
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 year' : `${years} years`;
}

function startOfWeekUTC(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const diff = now.getUTCDate() - day;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
}

function startOfMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function BurnBuddySkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center border-b border-gray-700 py-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-4 w-12 rounded bg-gray-800" />
          <div className="h-8 w-8 rounded-full bg-gray-800" />
          <div className="h-6 w-32 rounded bg-gray-800" />
          <div className="h-5 w-14 rounded-full bg-gray-800" />
        </div>
      </div>

      {/* Schedule skeleton */}
      <div className="mb-5 h-10 rounded-md border-2 border-dashed border-gray-800 bg-gray-800/20" />

      {/* Stats grid skeleton */}
      <div className="mb-7 grid grid-cols-2 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="rounded-lg border border-gray-700 p-3.5">
            <div className="mb-2 h-4 w-24 rounded bg-gray-800" />
            <div className="h-6 w-16 rounded bg-gray-800" />
          </div>
        ))}
      </div>

      {/* Workout log skeleton */}
      <div className="mb-3 h-5 w-40 rounded bg-gray-800" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between border-b border-gray-700 py-3">
          <div>
            <div className="mb-1 h-4 w-28 rounded bg-gray-800" />
            <div className="h-3 w-20 rounded bg-gray-800" />
          </div>
          <div className="h-4 w-16 rounded bg-gray-800" />
        </div>
      ))}
    </div>
  );
}

export default function BurnBuddyDetailPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const id = params['id'] as string;
  const queryClient = useQueryClient();

  const { data, isLoading: dataLoading, error } = useBurnBuddy(id);

  const burnBuddy = data?.burnBuddy ?? null;
  const partner = data?.partner ?? null;
  const streaks = data?.streaks ?? { burnStreak: 0, supernovaStreak: 0, last7Days: [] };
  const groupWorkouts = data?.groupWorkouts ?? [];
  const stats = data?.stats ?? null;

  // Edit schedule state
  const [editing, setEditing] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Day[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [timeError, setTimeError] = useState(false);

  const canSaveSchedule = selectedDays.length > 0 && scheduleTime.trim() !== '';

  const notFound = !!error;

  const weekStart = useMemo(() => startOfWeekUTC(), []);
  const monthStart = useMemo(() => startOfMonthUTC(), []);
  const workoutsThisWeek = useMemo(
    () => groupWorkouts.filter((gw) => new Date(gw.startedAt) >= weekStart).length,
    [groupWorkouts, weekStart],
  );
  const workoutsThisMonth = useMemo(
    () => groupWorkouts.filter((gw) => new Date(gw.startedAt) >= monthStart).length,
    [groupWorkouts, monthStart],
  );

  const handleSaveSchedule = async () => {
    if (!scheduleTime.trim()) {
      setTimeError(true);
      return;
    }
    setTimeError(false);
    setSaving(true);
    try {
      const workoutSchedule: WorkoutSchedule | undefined =
        selectedDays.length > 0 ? { days: selectedDays, time: scheduleTime } : undefined;
      const updated = await apiPut<BurnBuddy>(`/burn-buddies/${id}`, { workoutSchedule });
      queryClient.setQueryData<BurnBuddyData>(queryKeys.burnBuddy(id), (old) =>
        old ? { ...old, burnBuddy: updated } : old,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.burnBuddy(id) });
      setEditing(false);
    } catch {
      // keep editing open
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: Day) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  if (loading) return null;

  if (dataLoading) {
    return (
      <main className="mx-auto max-w-xl px-4">
        <div className="border-b border-gray-700 py-4 mb-6">
          <Link href="/" className="text-sm text-gray-400 no-underline hover:text-gray-200">
            ← Back
          </Link>
        </div>
        <BurnBuddySkeleton />
      </main>
    );
  }

  if (notFound || !burnBuddy) {
    return (
      <main className="mx-auto max-w-xl px-4">
        <div className="border-b border-gray-700 py-4 mb-6">
          <Link href="/" className="text-sm text-gray-400 no-underline hover:text-gray-200">
            ← Back
          </Link>
        </div>
        <p className="text-gray-400">Burn Buddy not found.</p>
      </main>
    );
  }

  const partnerName = partner?.displayName ?? (burnBuddy.uid1 === user?.uid ? burnBuddy.uid2 : burnBuddy.uid1);

  return (
      <main className="mx-auto max-w-xl px-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 py-4 mb-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-gray-400 no-underline hover:text-gray-200">
              ← Back
            </Link>
            {partner && <Avatar displayName={partner.displayName} profilePictureUrl={partner.profilePictureUrl} size="sm" />}
            <h1 className="m-0 text-xl font-bold text-white">{partnerName}</h1>
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-400">
              Buddy
            </span>
          </div>
        </div>

        {/* Workout schedule — inline editing via schedule box */}
        <div className="mb-5">
          <div className="flex items-center gap-3">
            {/* Schedule box or placeholder */}
            {burnBuddy.workoutSchedule && burnBuddy.workoutSchedule.days.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (!editing) {
                    setSelectedDays((burnBuddy.workoutSchedule!.days as Day[]) ?? []);
                    setScheduleTime(burnBuddy.workoutSchedule!.time ?? '');
                    setTimeError(false);
                  }
                  setEditing((e) => !e);
                }}
                className="flex-1 cursor-pointer rounded-md border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-left text-[13px] text-primary transition-colors hover:bg-primary/20"
              >
                <span className="flex items-center justify-between">
                  <span>
                    Schedule: {burnBuddy.workoutSchedule.days.join(', ')}
                    {burnBuddy.workoutSchedule.time && ` at ${burnBuddy.workoutSchedule.time}`}
                  </span>
                  <span className="ml-2 text-[11px] text-primary/60">{editing ? '▴' : '▾'}</span>
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!editing) {
                    setSelectedDays([]);
                    setScheduleTime('');
                    setTimeError(false);
                  }
                  setEditing((e) => !e);
                }}
                className="flex-1 cursor-pointer rounded-md border-2 border-dashed border-gray-600 bg-transparent px-3.5 py-2.5 text-left text-[13px] text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-300"
              >
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="text-base leading-none">+</span>
                    <span>Add a schedule</span>
                  </span>
                  <span className="ml-2 text-[11px] text-gray-500">{editing ? '▴' : '▾'}</span>
                </span>
              </button>
            )}

            {/* Add to Calendar button — always visible when schedule exists */}
            {burnBuddy.workoutSchedule && burnBuddy.workoutSchedule.days.length > 0 && (
              <AddToCalendarButton endpoint={`/burn-buddies/${id}/calendar`} />
            )}
          </div>

          {/* Inline schedule editor */}
          {editing && (
            <div className="mt-3 rounded-lg border border-gray-700 bg-surface p-4">
              <h3 className="mb-3 text-[15px] font-semibold text-white">Workout Schedule</h3>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`cursor-pointer rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
                      selectedDays.includes(day)
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-gray-600 bg-surface-elevated text-gray-300 hover:bg-gray-500/20'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <label className="text-[13px] text-gray-400">Time:</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => { setScheduleTime(e.target.value); setTimeError(false); }}
                    className="rounded-md border border-gray-600 bg-surface-elevated px-2 py-1 text-[13px] text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                {timeError && (
                  <p className="mt-1 text-xs text-red-400">Please select a workout time</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveSchedule}
                  disabled={saving || !canSaveSchedule}
                  className="cursor-pointer rounded-md border-none bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Schedule'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="cursor-pointer rounded-md border border-gray-600 bg-surface px-4 py-2 text-sm text-gray-300 hover:bg-surface-elevated"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Streak dots */}
        <div className="mb-5 flex flex-col gap-2">
          <StreakDots
            streakCount={streaks.burnStreak}
            last7Days={streaks.last7Days}
            color="orange"
            label="Burn Streak"
          />
          <StreakDots
            streakCount={streaks.supernovaStreak}
            last7Days={streaks.last7Days}
            color="violet"
            label="Supernova Streak"
          />
        </div>

        {/* Stats grid */}
        <div className="mb-7 grid grid-cols-2 gap-3">
          <StatCard
            label="Highest Streak"
            value={stats?.highestStreakEver.value ? `${stats.highestStreakEver.value}` : '—'}
            unit={stats?.highestStreakEver.date ? formatDate(stats.highestStreakEver.date) : 'days'}
            colorClass="text-amber-500"
          />
          <StatCard
            label="First Workout"
            value={stats?.firstGroupWorkoutDate ? formatDate(stats.firstGroupWorkoutDate) : '—'}
            colorClass="text-gray-500"
          />
          <StatCard label="Total Workouts" value={`${stats?.groupWorkoutsAllTime ?? 0}`} unit="all time" colorClass="text-secondary" />
          <StatCard label="This Month" value={`${stats?.groupWorkoutsThisMonth ?? workoutsThisMonth}`} unit="group workouts" colorClass="text-secondary" />
          <StatCard label="This Week" value={`${workoutsThisWeek}`} unit="group workouts" colorClass="text-secondary" />
          <StatCard label="Burn Buddy Since" value={buddyAge(burnBuddy.createdAt)} colorClass="text-gray-500" />
        </div>

        {/* Group workout log */}
        <h2 className="mb-3 text-base font-semibold text-white">Group Workout Log</h2>
        {groupWorkouts.length === 0 ? (
          <p className="text-sm text-gray-400">No group workouts yet. Start one together!</p>
        ) : (
          <div>
            {groupWorkouts.map((gw) => (
              <Link
                key={gw.id}
                href={`/burn-buddies/${id}/group-workouts/${gw.id}`}
                className="flex items-center justify-between border-b border-gray-700 py-3 -mx-2 px-2 rounded transition-colors hover:bg-gray-800"
              >
                <div>
                  <div className="text-sm font-medium text-white">{formatDate(gw.startedAt)}</div>
                  <div className="text-xs text-gray-400">{gw.workoutIds.length} workout(s)</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-gray-400">{timeAgo(gw.startedAt)}</span>
                  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
  );
}
