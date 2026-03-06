'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPut } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { StatCard } from '@/components/StatCard';
import { Avatar } from '@/components/Avatar';
import { AddToCalendarButton } from '@/components/AddToCalendarButton';
import type { BurnBuddy, GroupWorkout, GroupStats, WorkoutSchedule } from '@burnbuddy/shared';

interface PartnerProfile {
  uid: string;
  displayName: string;
  email: string;
  profilePictureUrl?: string;
}

interface Streaks {
  burnStreak: number;
  supernovaStreak: number;
}

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

export default function BurnBuddyDetailPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const id = params['id'] as string;

  const [burnBuddy, setBurnBuddy] = useState<BurnBuddy | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [streaks, setStreaks] = useState<Streaks>({ burnStreak: 0, supernovaStreak: 0 });
  const [groupWorkouts, setGroupWorkouts] = useState<GroupWorkout[]>([]);
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Edit schedule state
  const [editing, setEditing] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Day[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const bb = await apiGet<BurnBuddy>(`/burn-buddies/${id}`);
      setBurnBuddy(bb);

      const partnerUid = bb.uid1 === user.uid ? bb.uid2 : bb.uid1;

      const [partnerProfile, fetchedStreaks, allGroupWorkouts, fetchedStats] = await Promise.all([
        apiGet<PartnerProfile>(`/users/${partnerUid}`).catch(() => null),
        apiGet<Streaks>(`/burn-buddies/${id}/streaks`).catch(() => ({ burnStreak: 0, supernovaStreak: 0 })),
        apiGet<GroupWorkout[]>('/group-workouts').catch(() => [] as GroupWorkout[]),
        apiGet<GroupStats>(`/burn-buddies/${id}/stats`).catch(() => null),
      ]);

      setPartner(partnerProfile);
      setStreaks(fetchedStreaks);
      setStats(fetchedStats);

      // Filter group workouts for this burn buddy (referenceId === id, type === 'buddy')
      const buddyWorkouts = allGroupWorkouts
        .filter((gw) => gw.type === 'buddy' && gw.referenceId === id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      setGroupWorkouts(buddyWorkouts);

      // Pre-fill edit form with existing schedule
      if (bb.workoutSchedule) {
        setSelectedDays((bb.workoutSchedule.days as Day[]) ?? []);
        setScheduleTime(bb.workoutSchedule.time ?? '');
      }
    } catch (err: unknown) {
      const status = (err as { message?: string })?.message;
      if (status?.includes('404') || status?.includes('403')) {
        setNotFound(true);
      }
    } finally {
      setDataLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      const workoutSchedule: WorkoutSchedule | undefined =
        selectedDays.length > 0 ? { days: selectedDays, time: scheduleTime || undefined } : undefined;
      const updated = await apiPut<BurnBuddy>(`/burn-buddies/${id}`, { workoutSchedule });
      setBurnBuddy(updated);
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
      <>
        <NavBar />
        <main className="mx-auto max-w-xl px-4">
          <div className="border-b border-gray-200 py-4 mb-6">
            <Link href="/" className="text-sm text-gray-500 no-underline hover:text-gray-700">
              ← Back
            </Link>
          </div>
          <p className="text-gray-500">Loading...</p>
        </main>
      </>
    );
  }

  if (notFound || !burnBuddy) {
    return (
      <>
        <NavBar />
        <main className="mx-auto max-w-xl px-4">
          <div className="border-b border-gray-200 py-4 mb-6">
            <Link href="/" className="text-sm text-gray-500 no-underline hover:text-gray-700">
              ← Back
            </Link>
          </div>
          <p className="text-gray-400">Burn Buddy not found.</p>
        </main>
      </>
    );
  }

  const weekStart = startOfWeekUTC();
  const monthStart = startOfMonthUTC();
  const workoutsThisWeek = groupWorkouts.filter((gw) => new Date(gw.startedAt) >= weekStart).length;
  const workoutsThisMonth = groupWorkouts.filter((gw) => new Date(gw.startedAt) >= monthStart).length;
  const partnerName = partner?.displayName ?? (burnBuddy.uid1 === user?.uid ? burnBuddy.uid2 : burnBuddy.uid1);

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-xl px-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 py-4 mb-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-gray-500 no-underline hover:text-gray-700">
              ← Back
            </Link>
            {partner && <Avatar displayName={partner.displayName} profilePictureUrl={partner.profilePictureUrl} size="sm" />}
            <h1 className="m-0 text-xl font-bold">{partnerName}</h1>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
              Buddy
            </span>
          </div>
          <button
            onClick={() => {
              setEditing((e) => !e);
              if (!editing && burnBuddy.workoutSchedule) {
                setSelectedDays((burnBuddy.workoutSchedule.days as Day[]) ?? []);
                setScheduleTime(burnBuddy.workoutSchedule.time ?? '');
              } else if (!editing) {
                setSelectedDays([]);
                setScheduleTime('');
              }
            }}
            className="cursor-pointer rounded-md border border-gray-300 bg-white px-3.5 py-1.5 text-[13px] hover:bg-gray-50"
          >
            {editing ? 'Cancel' : 'Edit Schedule'}
          </button>
        </div>

        {/* Edit schedule panel */}
        {editing && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-[15px] font-semibold">Workout Schedule</h3>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`cursor-pointer rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
                    selectedDays.includes(day)
                      ? 'border-success bg-green-50 text-green-600'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <div className="mb-3 flex items-center gap-2">
              <label className="text-[13px] text-gray-500">Time (optional):</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              onClick={handleSaveSchedule}
              disabled={saving}
              className="cursor-pointer rounded-md border-none bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        )}

        {/* Workout schedule display */}
        {!editing && burnBuddy.workoutSchedule && burnBuddy.workoutSchedule.days.length > 0 && (
          <div className="mb-5 flex items-center gap-3">
            <div className="flex-1 rounded-md border border-green-200 bg-green-50 px-3.5 py-2.5 text-[13px] text-green-800">
              Schedule: {burnBuddy.workoutSchedule.days.join(', ')}
              {burnBuddy.workoutSchedule.time && ` at ${burnBuddy.workoutSchedule.time}`}
            </div>
            <AddToCalendarButton endpoint={`/burn-buddies/${id}/calendar`} />
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
          <StatCard label="Burn Buddy Since" value={buddyAge(burnBuddy.createdAt)} colorClass="text-gray-500" />
        </div>

        {/* Group workout log */}
        <h2 className="mb-3 text-base font-semibold">Group Workout Log</h2>
        {groupWorkouts.length === 0 ? (
          <p className="text-sm text-gray-400">No group workouts yet. Start one together!</p>
        ) : (
          <div>
            {groupWorkouts.map((gw) => (
              <div
                key={gw.id}
                className="flex items-center justify-between border-b border-gray-100 py-3"
              >
                <div>
                  <div className="text-sm font-medium">{formatDate(gw.startedAt)}</div>
                  <div className="text-xs text-gray-400">{gw.workoutIds.length} workout(s)</div>
                </div>
                <div className="text-[13px] text-gray-500">{timeAgo(gw.startedAt)}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
