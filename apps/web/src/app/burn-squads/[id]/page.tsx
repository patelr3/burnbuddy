'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPut, apiDelete } from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import type { BurnSquad, GroupWorkout, WorkoutSchedule } from '@burnbuddy/shared';

interface MemberProfile {
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

export default function BurnSquadDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params['id'] as string;

  const [squad, setSquad] = useState<BurnSquad | null>(null);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [streaks, setStreaks] = useState<Streaks>({ burnStreak: 0, supernovaStreak: 0 });
  const [groupWorkouts, setGroupWorkouts] = useState<GroupWorkout[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Edit settings state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [onlyAdminsCanAdd, setOnlyAdminsCanAdd] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Day[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const sq = await apiGet<BurnSquad>(`/burn-squads/${id}`);
      setSquad(sq);

      const [memberProfiles, fetchedStreaks, allGroupWorkouts] = await Promise.all([
        Promise.all(
          sq.memberUids.map((uid) =>
            apiGet<MemberProfile>(`/users/${uid}`).catch(() => ({ uid, displayName: uid, email: '' })),
          ),
        ),
        apiGet<Streaks>(`/burn-squads/${id}/streaks`).catch(() => ({ burnStreak: 0, supernovaStreak: 0 })),
        apiGet<GroupWorkout[]>('/group-workouts').catch(() => [] as GroupWorkout[]),
      ]);

      setMembers(memberProfiles);
      setStreaks(fetchedStreaks);

      const squadWorkouts = allGroupWorkouts
        .filter((gw) => gw.type === 'squad' && gw.referenceId === id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      setGroupWorkouts(squadWorkouts);

      // Pre-fill edit form
      setEditName(sq.name);
      setOnlyAdminsCanAdd(sq.settings.onlyAdminsCanAddMembers);
      if (sq.settings.workoutSchedule) {
        setSelectedDays((sq.settings.workoutSchedule.days as Day[]) ?? []);
        setScheduleTime(sq.settings.workoutSchedule.time ?? '');
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('404') || msg.includes('403')) {
        setNotFound(true);
      }
    } finally {
      setDataLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const workoutSchedule: WorkoutSchedule | undefined =
        selectedDays.length > 0 ? { days: selectedDays, time: scheduleTime || undefined } : undefined;
      const updated = await apiPut<BurnSquad>(`/burn-squads/${id}`, {
        name: editName,
        settings: {
          onlyAdminsCanAddMembers: onlyAdminsCanAdd,
          ...(workoutSchedule !== undefined && { workoutSchedule }),
        },
      });
      setSquad(updated);
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

  if (notFound || !squad) {
    return (
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ padding: '16px 0', borderBottom: '1px solid #e2e8f0', marginBottom: 24 }}>
          <Link href="/" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
            ← Back
          </Link>
        </div>
        <p style={{ color: '#9ca3af' }}>Burn Squad not found.</p>
      </main>
    );
  }

  const isAdmin = squad.adminUid === user?.uid;
  const weekStart = startOfWeekUTC();
  const monthStart = startOfMonthUTC();
  const workoutsThisWeek = groupWorkouts.filter((gw) => new Date(gw.startedAt) >= weekStart).length;
  const workoutsThisMonth = groupWorkouts.filter((gw) => new Date(gw.startedAt) >= monthStart).length;

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
          <h1 style={{ margin: 0, fontSize: 20 }}>{squad.name}</h1>
          <span
            style={{
              fontSize: 11,
              padding: '2px 7px',
              borderRadius: 12,
              backgroundColor: '#ede9fe',
              color: '#5b21b6',
            }}
          >
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
              }
            }}
            style={{ padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}
          >
            {editing ? 'Cancel' : 'Edit Settings'}
          </button>
        )}
      </div>

      {/* Edit settings panel (admin only) */}
      {editing && isAdmin && (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 16,
            backgroundColor: '#f8fafc',
            marginBottom: 24,
          }}
        >
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Squad Settings</h3>

          <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
            Squad Name
          </label>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            style={{
              width: '100%',
              fontSize: 14,
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid #d1d5db',
              marginBottom: 12,
              boxSizing: 'border-box',
            }}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={onlyAdminsCanAdd}
              onChange={(e) => setOnlyAdminsCanAdd(e.target.checked)}
            />
            Only admins can add members
          </label>

          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Workout Schedule</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
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
                  borderColor: selectedDays.includes(day) ? '#8b5cf6' : '#d1d5db',
                  backgroundColor: selectedDays.includes(day) ? '#f5f3ff' : 'white',
                  color: selectedDays.includes(day) ? '#5b21b6' : '#374151',
                }}
              >
                {day}
              </button>
            ))}
          </div>
          {selectedDays.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: '#6b7280' }}>Time (optional):</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                style={{ fontSize: 13, padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={handleSaveSettings}
              disabled={saving || !editName.trim()}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                backgroundColor: 'white',
                color: '#dc2626',
                border: '1px solid #dc2626',
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              Delete Squad
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div
          style={{
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: 16,
            backgroundColor: '#fff5f5',
            marginBottom: 24,
          }}
        >
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#dc2626' }}>
            Are you sure you want to delete <strong>{squad.name}</strong>? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              {deleting ? 'Deleting…' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                backgroundColor: 'white',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Schedule display */}
      {!editing && squad.settings.workoutSchedule && squad.settings.workoutSchedule.days.length > 0 && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 6,
            backgroundColor: '#f5f3ff',
            border: '1px solid #ddd6fe',
            marginBottom: 20,
            fontSize: 13,
            color: '#5b21b6',
          }}
        >
          Schedule: {squad.settings.workoutSchedule.days.join(', ')}
          {squad.settings.workoutSchedule.time && ` at ${squad.settings.workoutSchedule.time}`}
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
        <StatCard label="Squad Age" value={squadAge(squad.createdAt)} unit="" color="#6b7280" />
        <StatCard label="Created" value={formatDate(squad.createdAt)} unit="" color="#6b7280" />
      </div>

      {/* Member list */}
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Members ({squad.memberUids.length})</h2>
      <div style={{ marginBottom: 28 }}>
        {members.map((member) => (
          <div
            key={member.uid}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: '#e0e7ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
                color: '#4338ca',
                flexShrink: 0,
              }}
            >
              {member.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {member.displayName}
                {member.uid === squad.adminUid && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 10,
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                    }}
                  >
                    Admin
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>{member.email}</div>
            </div>
          </div>
        ))}
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
