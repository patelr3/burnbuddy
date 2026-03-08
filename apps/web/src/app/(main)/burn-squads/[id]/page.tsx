'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiPut, apiDelete } from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { StatCard } from '@/components/StatCard';
import { Avatar } from '@/components/Avatar';
import { AddToCalendarButton } from '@/components/AddToCalendarButton';
import { useBurnSquad, queryKeys } from '@/lib/queries';
import type { BurnSquadData } from '@/lib/queries';
import type { BurnSquad, WorkoutSchedule } from '@burnbuddy/shared';

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

function squadAge(createdAt: string): string {
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
  const day = now.getUTCDay();
  const diff = now.getUTCDate() - day;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
}

function startOfMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function BurnSquadSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between border-b border-gray-700 py-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-4 w-12 rounded bg-gray-800" />
          <div className="h-6 w-36 rounded bg-gray-800" />
          <div className="h-5 w-14 rounded-full bg-gray-800" />
        </div>
        <div className="h-8 w-28 rounded-md bg-gray-800" />
      </div>

      {/* Stats grid skeleton */}
      <div className="mb-7 grid grid-cols-2 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="rounded-lg border border-gray-700 p-3.5">
            <div className="mb-2 h-4 w-24 rounded bg-gray-800" />
            <div className="h-6 w-16 rounded bg-gray-800" />
          </div>
        ))}
      </div>

      {/* Members skeleton */}
      <div className="mb-3 h-5 w-28 rounded bg-gray-800" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b border-gray-700 py-2.5">
          <div className="h-8 w-8 rounded-full bg-gray-800" />
          <div>
            <div className="mb-1 h-4 w-24 rounded bg-gray-800" />
          </div>
        </div>
      ))}

      {/* Workout log skeleton */}
      <div className="mt-7 mb-3 h-5 w-40 rounded bg-gray-800" />
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

export default function BurnSquadDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params['id'] as string;
  const queryClient = useQueryClient();

  const { data, isLoading: dataLoading, error } = useBurnSquad(id);

  const squad = data?.squad ?? null;
  const members = data?.squad?.members ?? [];
  const streaks = data?.streaks ?? { burnStreak: 0, supernovaStreak: 0 };
  const groupWorkouts = data?.groupWorkouts ?? [];
  const stats = data?.stats ?? null;
  const notFound = !!error;

  // Edit settings state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [onlyAdminsCanAdd, setOnlyAdminsCanAdd] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Day[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [timeError, setTimeError] = useState(false);

  const canSaveSettings = editName.trim() !== '' && (selectedDays.length === 0 || scheduleTime.trim() !== '');

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = useMemo(() => squad?.adminUid === user?.uid, [squad, user]);
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

  const handleSaveSettings = async () => {
    if (selectedDays.length > 0 && !scheduleTime.trim()) {
      setTimeError(true);
      return;
    }
    setTimeError(false);
    setSaving(true);
    try {
      const workoutSchedule: WorkoutSchedule | undefined =
        selectedDays.length > 0 ? { days: selectedDays, time: scheduleTime || '' } : undefined;
      const updated = await apiPut<BurnSquad>(`/burn-squads/${id}`, {
        name: editName,
        settings: {
          onlyAdminsCanAddMembers: onlyAdminsCanAdd,
          ...(workoutSchedule !== undefined && { workoutSchedule }),
        },
      });
      queryClient.setQueryData<BurnSquadData>(queryKeys.burnSquad(id), (old) =>
        old ? { ...old, squad: { ...updated, members: old.squad.members } } : old,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.burnSquad(id) });
      setEditing(false);
    } catch {
      // keep editing open
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiDelete(`/burn-squads/${id}`);
      router.push('/');
    } catch {
      setDeleting(false);
      setShowDeleteConfirm(false);
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
        <BurnSquadSkeleton />
      </main>
    );
  }

  if (notFound || !squad) {
    return (
      <main className="mx-auto max-w-xl px-4">
        <div className="border-b border-gray-700 py-4 mb-6">
          <Link href="/" className="text-sm text-gray-400 no-underline hover:text-gray-200">
            ← Back
          </Link>
        </div>
        <p className="text-gray-400">Burn Squad not found.</p>
      </main>
    );
  }

  return (
      <main className="mx-auto max-w-xl px-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 py-4 mb-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-gray-400 no-underline hover:text-gray-200">
              ← Back
            </Link>
            <h1 className="m-0 text-xl font-bold text-white">{squad.name}</h1>
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-400">
              Squad
            </span>
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                setEditing((e) => !e);
                if (!editing) {
                  setEditName(squad.name);
                  setOnlyAdminsCanAdd(squad.settings.onlyAdminsCanAddMembers);
                  setSelectedDays((squad.settings.workoutSchedule?.days as Day[]) ?? []);
                  setScheduleTime(squad.settings.workoutSchedule?.time ?? '');
                  setTimeError(false);
                }
              }}
              className="cursor-pointer rounded-md border border-gray-600 bg-surface px-3.5 py-1.5 text-[13px] text-white hover:bg-surface-elevated"
            >
              {editing ? 'Cancel' : 'Edit Settings'}
            </button>
          )}
        </div>

        {/* Edit settings panel (admin only) */}
        {editing && isAdmin && (
          <div className="mb-6 rounded-lg border border-gray-700 bg-surface p-4">
            <h3 className="mb-3 text-[15px] font-semibold text-white">Squad Settings</h3>

            <label className="mb-1 block text-[13px] text-gray-400">
              Squad Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mb-3 w-full rounded-md border border-gray-600 bg-surface-elevated px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />

            <label className="mb-3 flex cursor-pointer items-center gap-2 text-[13px] text-gray-300">
              <input
                type="checkbox"
                checked={onlyAdminsCanAdd}
                onChange={(e) => setOnlyAdminsCanAdd(e.target.checked)}
              />
              Only admins can add members
            </label>

            <div className="mb-1.5 text-[13px] text-gray-400">Workout Schedule</div>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`cursor-pointer rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
                    selectedDays.includes(day)
                      ? 'border-violet-500 bg-violet-500/20 text-violet-400'
                      : 'border-gray-600 bg-surface-elevated text-gray-300 hover:bg-gray-500/20'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            {selectedDays.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <label className="text-[13px] text-gray-400">Time:</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => { setScheduleTime(e.target.value); setTimeError(false); }}
                    className="rounded-md border border-gray-600 bg-surface-elevated px-2 py-1 text-[13px] text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                {timeError && (
                  <p className="mt-1 text-xs text-red-400">Please select a workout time</p>
                )}
              </div>
            )}

            <div className="mt-1 flex gap-2">
              <button
                onClick={handleSaveSettings}
                disabled={saving || !canSaveSettings}
                className="cursor-pointer rounded-md border-none bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="cursor-pointer rounded-md border border-red-500/30 bg-transparent px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                Delete Squad
              </button>
            </div>
          </div>
        )}

        {/* Delete confirmation dialog */}
        {showDeleteConfirm && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-surface p-4">
            <p className="mb-3 text-sm text-red-400">
              Are you sure you want to delete <strong className="text-white">{squad.name}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="cursor-pointer rounded-md border-none bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="cursor-pointer rounded-md border border-gray-600 bg-surface-elevated px-4 py-2 text-sm text-gray-300 hover:bg-gray-500/20"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Schedule display */}
        {!editing && squad.settings.workoutSchedule && squad.settings.workoutSchedule.days.length > 0 && (
          <div className="mb-5 flex items-center gap-3">
            <div className="flex-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-3.5 py-2.5 text-[13px] text-violet-400">
              Schedule: {squad.settings.workoutSchedule.days.join(', ')}
              {squad.settings.workoutSchedule.time && ` at ${squad.settings.workoutSchedule.time}`}
            </div>
            <AddToCalendarButton endpoint={`/burn-squads/${id}/calendar`} />
          </div>
        )}

        {/* Stats grid */}
        <div className="mb-7 grid grid-cols-2 gap-3">
          <StatCard label="Burn Streak" value={`${streaks.burnStreak}`} unit="days" colorClass="text-primary" />
          <StatCard label="Supernova Streak" value={`${streaks.supernovaStreak}`} unit="days" colorClass="text-violet-500" />
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
          <StatCard label="Squad Age" value={squadAge(squad.createdAt)} colorClass="text-gray-500" />
        </div>

        {/* Member list */}
        <h2 className="mb-3 text-base font-semibold text-white">Members ({squad.memberUids.length})</h2>
        <div className="mb-7">
          {members.map((member) => (
            <div
              key={member.uid}
              className="flex items-center gap-3 border-b border-gray-700 py-2.5"
            >
              <Avatar displayName={member.displayName} profilePictureUrl={member.photoURL} size="sm" />
              <div>
                <div className="text-sm font-medium text-white">
                  {member.displayName}
                  {member.uid === squad.adminUid && (
                    <span className="ml-2 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[11px] text-amber-400">
                      Admin
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
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
                href={`/burn-squads/${id}/group-workouts/${gw.id}`}
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
