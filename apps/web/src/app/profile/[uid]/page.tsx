'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiPost } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { NavBar } from '@/components/NavBar';
import { StatCard } from '@/components/StatCard';
import { Avatar } from '@/components/Avatar';
import { useProfile, queryKeys } from '@/lib/queries';

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header: avatar + name + badge */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-gray-200" />
          <div>
            <div className="mb-2 h-7 w-40 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
          </div>
        </div>
        <div className="h-8 w-28 rounded-full bg-gray-200" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg border border-slate-100 p-3.5">
            <div className="mb-2 h-4 w-24 rounded bg-gray-200" />
            <div className="h-6 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FriendProfilePage() {
  const { loading } = useAuth();
  const params = useParams();
  const uid = params['uid'] as string;
  const queryClient = useQueryClient();

  const { data: profile, isLoading: dataLoading, error } = useProfile(uid);

  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const handleRequestBurnBuddy = async () => {
    setSendingRequest(true);
    setMutationError(null);
    try {
      await apiPost('/burn-buddies/requests', { toUid: uid });
      setRequestSent(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(uid) });
    } catch {
      setMutationError('Failed to send Burn Buddy request.');
    } finally {
      setSendingRequest(false);
    }
  };

  const errorMessage = error
    ? (error.message?.includes('404')
        ? 'User not found.'
        : error.message?.includes('403')
          ? 'You can only view profiles of your friends.'
          : 'Failed to load profile.')
    : mutationError;

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

        {dataLoading && <ProfileSkeleton />}

        {!dataLoading && errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger">
            {errorMessage}
          </div>
        )}

        {!dataLoading && profile && (
          <>
            {/* Header with name and burn buddy action */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar displayName={profile.displayName} profilePictureUrl={profile.profilePictureUrl} size="lg" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{profile.displayName}</h1>
                  {profile.username && (
                    <p className="mt-0.5 text-sm text-gray-400">@{profile.username}</p>
                  )}
                </div>
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
