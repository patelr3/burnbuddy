'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPut } from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import type { BurnBuddy, GroupWorkout, WorkoutSchedule } from '@burnbuddy/shared';

interface PartnerProfile {
  uid: string;
  displayName: string;
  email: string;
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
  const router = useRouter();
  const params = useParams();
  const id = params['id'] as string;

  const [burnBuddy, setBurnBuddy] = useState<BurnBuddy | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [streaks, setStreaks] = useState<Streaks>({ burnStreak: 0, supernovaStreak: 0 });
  const [groupWorkouts, setGroupWorkouts] = useState<GroupWorkout[]>([]);
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

      const [partnerProfile, fetchedStreaks, allGroupWorkouts] = await Promise.all([
        apiGet<PartnerProfile>(`/users/${partnerUid}`).catch(() => null),
        apiGet<Streaks>(`/burn-buddies/${id}/streaks`).catch(() => ({ burnStreak: 0, supernovaStreak: 0 })),
        apiGet<GroupWorkout[]>('/group-workouts').catch(() => [] as GroupWorkout[]),
      ]);

      setPartner(partnerProfile);
      setStreaks(fetchedStreaks);

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
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ padding: '16px 0', borderBottom: '1px solid #e2e8f0', marginBottom: 24 }}>
          <Link href="/" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
            ← Back
          </Link>
        </div>
        <p style={{ color: '#6b7280' }}>Loading...</p>
      </main>
    );
  }

  if (notFound || !burnBuddy) {
    return (
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ padding: '16px 0', borderBottom: '1px solid #e2e8f0', marginBottom: 24 }}>
          <Link href="/" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
            ← Back
          </Link>
        </div>
        <p style={{ color: '#9ca3af' }}>Burn Buddy not found.</p>
      </main>
    );
  }

  const weekStart = startOfWeekUTC();
  const monthStart = startOfMonthUTC();
  const workoutsThisWeek = groupWorkouts.filter((gw) => new Date(gw.startedAt) >= weekStart).length;
  const workoutsThisMonth = groupWorkouts.filter((gw) => new Date(gw.startedAt) >= monthStart).length;
  const partnerName = partner?.displayName ?? (burnBuddy.uid1 === user?.uid ? burnBuddy.uid2 : burnBuddy.uid1);

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>
      {/* Nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 0',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
            ← Back
          </Link>
          <h1 style={{ margin: 0, fontSize: 20 }}>{partnerName}</h1>
          <span
            style={{
              fontSize: 11,
              padding: '2px 7px',
              borderRadius: 12,
              backgroundColor: '#fef3c7',
              color: '#92400e',
            }}
          >
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
          style={{ padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          {editing ? 'Cancel' : 'Edit Schedule'}
        </button>
      </div>

      {/* Edit schedule panel */}
      {editing && (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 16,
            backgroundColor: '#f8fafc',
            marginBottom: 24,
          }}
        >
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Workout Schedule</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {DAYS.map((day) => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                  borderRadius: 4,
                  border: '1px solid',
                  borderColor: selectedDays.includes(day) ? '#22c55e' : '#d1d5db',
                  backgroundColor: selectedDays.includes(day) ? '#f0fdf4' : 'white',
                  color: selectedDays.includes(day) ? '#16a34a' : '#374151',
                }}
              >
                {day}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#6b7280' }}>Time (optional):</label>
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              style={{ fontSize: 13, padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db' }}
            />
          </div>
          <button
            onClick={handleSaveSchedule}
            disabled={saving}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              backgroundColor: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            {saving ? 'Saving…' : 'Save Schedule'}
          </button>
        </div>
      )}

      {/* Workout schedule display */}
      {!editing && burnBuddy.workoutSchedule && burnBuddy.workoutSchedule.days.length > 0 && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 6,
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            marginBottom: 20,
            fontSize: 13,
            color: '#166534',
          }}
        >
          Schedule: {burnBuddy.workoutSchedule.days.join(', ')}
          {burnBuddy.workoutSchedule.time && ` at ${burnBuddy.workoutSchedule.time}`}
        </div>
      )}

      {/* Stats grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginBottom: 28,
        }}
      >
        <StatCard label="Burn Streak" value={`${streaks.burnStreak}`} unit="days" color="#f97316" />
        <StatCard label="Supernova Streak" value={`${streaks.supernovaStreak}`} unit="days" color="#8b5cf6" />
        <StatCard label="This Week" value={`${workoutsThisWeek}`} unit="group workouts" color="#3b82f6" />
        <StatCard label="This Month" value={`${workoutsThisMonth}`} unit="group workouts" color="#3b82f6" />
        <StatCard label="Burn Buddy Since" value={buddyAge(burnBuddy.createdAt)} unit="" color="#6b7280" />
        <StatCard label="Started" value={formatDate(burnBuddy.createdAt)} unit="" color="#6b7280" />
      </div>

      {/* Group workout log */}
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Group Workout Log</h2>
      {groupWorkouts.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 14 }}>No group workouts yet. Start one together!</p>
      ) : (
        <div>
          {groupWorkouts.map((gw) => (
            <div
              key={gw.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{formatDate(gw.startedAt)}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{gw.workoutIds.length} workout(s)</div>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>{timeAgo(gw.startedAt)}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 8,
        border: '1px solid #e2e8f0',
        backgroundColor: 'white',
      }}
    >
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 'bold', color }}>{value}</div>
      {unit && <div style={{ fontSize: 11, color: '#9ca3af' }}>{unit}</div>}
    </div>
  );
}
