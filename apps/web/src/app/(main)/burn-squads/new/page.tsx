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
          time: scheduleTime || '',
        };
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
      <main className="mx-auto max-w-xl px-4">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-700 py-4 mb-6">
          <Link href="/" className="text-sm text-gray-400 no-underline hover:text-gray-200">
            ← Back
          </Link>
          <h1 className="m-0 text-xl font-bold text-white">New Burn Squad</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Squad Name */}
        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-semibold text-white">
            Squad Name *
          </label>
          <input
            type="text"
            value={squadName}
            onChange={(e) => setSquadName(e.target.value)}
            placeholder="e.g. Morning Crew"
            className="w-full rounded-md border border-gray-600 bg-surface-elevated px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-secondary"
          />
        </div>

        {/* Friend Selection */}
        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-semibold text-white">
            Invite Friends
          </label>
          {dataLoading ? (
            <p className="text-sm text-gray-400">Loading friends…</p>
          ) : friends.length === 0 ? (
            <p className="text-sm text-gray-400">
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
                    className={`flex cursor-pointer items-center justify-between rounded-md border-2 p-3 mb-2 transition-colors ${
                      isSelected
                        ? 'border-secondary bg-secondary/20'
                        : 'border-gray-700 bg-surface hover:bg-surface-elevated'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">{friend.displayName}</div>
                      <div className="text-xs text-gray-400">{friend.email}</div>
                    </div>
                    {isSelected && <span className="text-base text-secondary">✓</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Workout Schedule */}
        <div className="mb-8">
          <label className="mb-1.5 block text-sm font-semibold text-white">
            Workout Schedule (optional)
          </label>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {DAYS.map((day) => {
              const isOn = scheduleDays.has(day);
              return (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`cursor-pointer rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
                    isOn
                      ? 'border-secondary bg-secondary text-white'
                      : 'border-gray-600 bg-surface-elevated text-gray-300 hover:bg-gray-500/20'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {scheduleDays.size > 0 && (
            <div>
              <label className="mb-1 block text-[13px] text-gray-400">
                Time (optional)
              </label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="rounded-md border border-gray-600 bg-surface-elevated px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-secondary"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href="/"
            className="rounded-md border border-gray-600 px-5 py-2.5 text-sm text-gray-300 no-underline hover:bg-surface-elevated"
          >
            Cancel
          </Link>
          <button
            onClick={handleSubmit}
            disabled={sending || !squadName.trim()}
            className="cursor-pointer rounded-md border-none bg-secondary px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {sending ? 'Creating…' : 'Create Burn Squad'}
          </button>
        </div>
      </main>
  );
}
