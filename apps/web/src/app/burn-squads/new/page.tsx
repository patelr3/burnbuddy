'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPost } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { WorkoutSchedule } from '@burnbuddy/shared';

interface FriendWithProfile {
  uid: string;
  displayName: string;
  email: string;
}

const DAYS: WorkoutSchedule['days'] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function NewBurnSquadPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [squadName, setSquadName] = useState('');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [scheduleDays, setScheduleDays] = useState<Set<string>>(new Set());
  const [scheduleTime, setScheduleTime] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiGet<FriendWithProfile[]>('/friends')
      .then(setFriends)
      .catch(() => setFriends([]))
      .finally(() => setDataLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggleFriend = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleDay = (day: string) => {
    setScheduleDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!squadName.trim()) {
      setError('Squad name is required.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const body: {
        name: string;
        inviteUids: string[];
        workoutSchedule?: WorkoutSchedule;
      } = {
        name: squadName.trim(),
        inviteUids: [...selectedUids],
      };
      if (scheduleDays.size > 0) {
        const schedule: WorkoutSchedule = {
          days: [...scheduleDays] as WorkoutSchedule['days'],
        };
        if (scheduleTime) schedule.time = scheduleTime;
        body.workoutSchedule = schedule;
      }
      await apiPost('/burn-squads', body);
      router.push('/');
    } catch {
      setError('Failed to create Burn Squad. Please try again.');
      setSending(false);
    }
  };

  if (loading) return null;

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>
      {/* Nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 0',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 24,
        }}
      >
        <Link href="/" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
          ← Back
        </Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>New Burn Squad</h1>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 4,
            padding: '10px 14px',
            marginBottom: 16,
            color: '#dc2626',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Squad Name */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
          Squad Name *
        </label>
        <input
          type="text"
          value={squadName}
          onChange={(e) => setSquadName(e.target.value)}
          placeholder="e.g. Morning Crew"
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: 14,
            border: '1px solid #e2e8f0',
            borderRadius: 4,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Friend Selection */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
          Invite Friends
        </label>
        {dataLoading ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading friends…</p>
        ) : friends.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 14 }}>
            No friends to invite yet — you can add them later
          </p>
        ) : (
          <div>
            {friends.map((friend) => {
              const isSelected = selectedUids.has(friend.uid);
              return (
                <div
                  key={friend.uid}
                  onClick={() => toggleFriend(friend.uid)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    marginBottom: 8,
                    borderRadius: 6,
                    border: `2px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}`,
                    backgroundColor: isSelected ? '#eff6ff' : 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{friend.displayName}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{friend.email}</div>
                  </div>
                  {isSelected && <span style={{ color: '#3b82f6', fontSize: 16 }}>✓</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Workout Schedule */}
      <div style={{ marginBottom: 32 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
          Workout Schedule (optional)
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {DAYS.map((day) => {
            const isOn = scheduleDays.has(day);
            return (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  border: `1px solid ${isOn ? '#3b82f6' : '#e2e8f0'}`,
                  borderRadius: 4,
                  backgroundColor: isOn ? '#3b82f6' : 'white',
                  color: isOn ? 'white' : '#374151',
                  cursor: 'pointer',
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
        {scheduleDays.size > 0 && (
          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
              Time (optional)
            </label>
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              style={{
                padding: '6px 10px',
                fontSize: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 4,
              }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Link
          href="/"
          style={{
            padding: '10px 20px',
            fontSize: 14,
            border: '1px solid #e2e8f0',
            borderRadius: 4,
            textDecoration: 'none',
            color: '#374151',
          }}
        >
          Cancel
        </Link>
        <button
          onClick={handleSubmit}
          disabled={sending || !squadName.trim()}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            cursor: 'pointer',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            opacity: sending || !squadName.trim() ? 0.6 : 1,
          }}
        >
          {sending ? 'Creating…' : 'Create Burn Squad'}
        </button>
      </div>
    </main>
  );
}
