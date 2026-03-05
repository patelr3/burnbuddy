'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPost } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { StatCard } from '@/components/StatCard';
import type { ProfileStats } from '@burnbuddy/shared';

export default function FriendProfilePage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const uid = params['uid'] as string;

  const [profile, setProfile] = useState<ProfileStats | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    setError(null);
    try {
      const data = await apiGet<ProfileStats>(`/users/${uid}/profile`);
      setProfile(data);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('404')) {
        setError('User not found.');
      } else if (msg.includes('403')) {
        setError('You can only view profiles of your friends.');
      } else {
        setError('Failed to load profile.');
      }
    } finally {
      setDataLoading(false);
    }
  }, [user, uid]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleRequestBurnBuddy = async () => {
    setSendingRequest(true);
    try {
      await apiPost('/burn-buddies/requests', { toUid: uid });
      setRequestSent(true);
      // Refresh profile to update buddyRelationshipStatus
      await loadProfile();
    } catch {
      setError('Failed to send Burn Buddy request.');
    } finally {
      setSendingRequest(false);
    }
  };

  if (loading) return null;

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-xl px-4 pt-6 pb-12">
        <div className="mb-6">
          <Link href="/friends" className="text-sm text-gray-500 no-underline hover:text-gray-700">
            ← Back to Friends
          </Link>
        </div>

        {dataLoading && <p className="text-gray-500">Loading…</p>}

        {!dataLoading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {!dataLoading && profile && (
          <>
            {/* Header with name and burn buddy action */}
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{profile.displayName}</h1>
                {profile.username && (
                  <p className="mt-0.5 text-sm text-gray-400">@{profile.username}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {profile.buddyRelationshipStatus === 'buddies' && (
                  <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-primary">
                    🔥 Burn Buddy
                  </span>
                )}
                {profile.buddyRelationshipStatus === 'pending_sent' && (
                  <span className="rounded-full bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-600">
                    🔥 Request Pending
                  </span>
                )}
                {profile.buddyRelationshipStatus === 'pending_received' && (
                  <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-success">
                    🔥 Request Received
                  </span>
                )}
                {profile.buddyRelationshipStatus === 'none' && !requestSent && (
                  <button
                    onClick={handleRequestBurnBuddy}
                    disabled={sendingRequest}
                    className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {sendingRequest ? 'Sending…' : '🔥 Request Burn Buddy'}
                  </button>
                )}
                {profile.buddyRelationshipStatus === 'none' && requestSent && (
                  <span className="rounded-full bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-600">
                    🔥 Request Sent
                  </span>
                )}
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Highest Active Streak"
                value={profile.highestActiveStreak ? `${profile.highestActiveStreak.value}` : '—'}
                unit={profile.highestActiveStreak?.name ?? 'days'}
                colorClass="text-primary"
              />
              <StatCard
                label="Highest Streak Ever"
                value={profile.highestStreakEver ? `${profile.highestStreakEver.value}` : '—'}
                unit={
                  profile.highestStreakEver
                    ? `${formatDate(profile.highestStreakEver.date)} · ${profile.highestStreakEver.name}`
                    : 'days'
                }
                colorClass="text-amber-500"
              />
              <StatCard
                label="First Workout"
                value={profile.firstWorkoutDate ? formatDate(profile.firstWorkoutDate) : '—'}
                colorClass="text-gray-500"
              />
              <StatCard
                label="Total Workouts"
                value={`${profile.workoutsAllTime}`}
                unit="all time"
                colorClass="text-secondary"
              />
              <StatCard
                label="This Month"
                value={`${profile.workoutsThisMonth}`}
                unit="workouts"
                colorClass="text-secondary"
              />
            </div>
          </>
        )}
      </main>
    </>
  );
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
