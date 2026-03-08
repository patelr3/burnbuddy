'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiPost, apiDelete } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { StatCard } from '@/components/StatCard';
import { StreakDots } from '@/components/StreakDots';
import { Avatar } from '@/components/Avatar';
import { useProfile, queryKeys } from '@/lib/queries';
import type { ProfileStats, StreakDayInfo } from '@burnbuddy/shared';

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header: avatar + name + badge */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-gray-800" />
          <div>
            <div className="mb-2 h-7 w-40 rounded bg-gray-800" />
            <div className="h-4 w-24 rounded bg-gray-800" />
          </div>
        </div>
        <div className="h-8 w-28 rounded-full bg-gray-800" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg border border-gray-700 p-3.5">
            <div className="mb-2 h-4 w-24 rounded bg-gray-800" />
            <div className="h-6 w-16 rounded bg-gray-800" />
          </div>
        ))}
      </div>
    </div>
  );
}

const EMPTY_LAST_7_DAYS: StreakDayInfo[] = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(Date.now() - (6 - i) * 86_400_000);
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
  return {
    date: d.toISOString().substring(0, 10),
    hasWorkout: false,
    groupWorkoutId: null,
    dayLabel: labels[d.getUTCDay()]!,
  };
});

export default function FriendProfilePage() {
  const { loading } = useAuth();
  const params = useParams();
  const uid = params['uid'] as string;
  const queryClient = useQueryClient();

  const router = useRouter();
  const { data: profile, isLoading: dataLoading, error } = useProfile(uid);

  const [mutationError, setMutationError] = useState<string | null>(null);

  const requestBuddyMutation = useMutation({
    mutationFn: () => apiPost('/burn-buddies/requests', { toUid: uid }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.profile(uid) });
      const previous = queryClient.getQueryData<ProfileStats>(queryKeys.profile(uid));
      queryClient.setQueryData<ProfileStats>(queryKeys.profile(uid), (old) =>
        old ? { ...old, buddyRelationshipStatus: 'pending_sent' as const } : old,
      );
      setMutationError(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<ProfileStats>(queryKeys.profile(uid), context.previous);
      }
      setMutationError('Failed to send Burn Buddy request.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(uid) });
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: () => apiDelete(`/friends/${uid}`),
    onMutate: () => setMutationError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      router.push('/friends');
    },
    onError: () => setMutationError('Failed to remove friend.'),
  });

  const removeBuddyMutation = useMutation({
    mutationFn: () => apiDelete(`/burn-buddies/${profile!.burnBuddyId}`),
    onMutate: () => setMutationError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(uid) });
    },
    onError: () => setMutationError('Failed to remove burn buddy.'),
  });

  const isActionPending = removeFriendMutation.isPending || removeBuddyMutation.isPending;

  const acceptBuddyMutation = useMutation({
    mutationFn: () => apiPost(`/burn-buddies/requests/${profile!.pendingBuddyRequestId}/accept`),
    onMutate: () => setMutationError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(uid) });
    },
    onError: () => setMutationError('Failed to accept burn buddy request.'),
  });

  const declineBuddyMutation = useMutation({
    mutationFn: () => apiPost(`/burn-buddies/requests/${profile!.pendingBuddyRequestId}/decline`),
    onMutate: () => setMutationError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(uid) });
    },
    onError: () => setMutationError('Failed to decline burn buddy request.'),
  });

  const cancelBuddyRequestMutation = useMutation({
    mutationFn: () => apiDelete(`/burn-buddies/requests/${profile!.pendingBuddyRequestId}`),
    onMutate: () => setMutationError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(uid) });
    },
    onError: () => setMutationError('Failed to cancel burn buddy request.'),
  });

  const isBuddyRequestActionPending =
    acceptBuddyMutation.isPending || declineBuddyMutation.isPending || cancelBuddyRequestMutation.isPending;

  function handleRemoveFriend() {
    if (!profile) return;
    const isBuddy = profile.buddyRelationshipStatus === 'buddies';
    const message = isBuddy
      ? `Removing ${profile.displayName} as a friend will also end your burn buddy relationship. Are you sure?`
      : `Remove ${profile.displayName} as a friend?`;
    if (window.confirm(message)) {
      removeFriendMutation.mutate();
    }
  }

  function handleRemoveBuddy() {
    if (!profile) return;
    if (window.confirm(`End burn buddy relationship with ${profile.displayName}? You will remain friends.`)) {
      removeBuddyMutation.mutate();
    }
  }

  function handleCancelBuddyRequest() {
    if (!profile) return;
    if (window.confirm(`Cancel burn buddy request to ${profile.displayName}?`)) {
      cancelBuddyRequestMutation.mutate();
    }
  }

  const errorMessage = error
    ? (error.message?.includes('404')
        ? 'User not found.'
        : error.message?.includes('403')
          ? 'You can only view profiles of your friends.'
          : 'Failed to load profile.')
    : mutationError;

  if (loading) return null;

  return (
      <main className="mx-auto max-w-xl px-4 pt-6 pb-12">
        <div className="mb-6">
          <Link href="/friends" className="text-sm text-gray-400 no-underline hover:text-gray-200">
            ← Back to Friends
          </Link>
        </div>

        {dataLoading && <ProfileSkeleton />}

        {!dataLoading && errorMessage && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-danger">
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
                  <h1 className="text-2xl font-bold text-white">{profile.displayName}</h1>
                  {profile.username && (
                    <p className="mt-0.5 text-sm text-gray-400">@{profile.username}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {profile.buddyRelationshipStatus === 'buddies' && (
                  <span className="rounded-full bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary">
                    🔥 Burn Buddy
                  </span>
                )}
                {profile.buddyRelationshipStatus === 'pending_sent' && (
                  <button
                    onClick={handleCancelBuddyRequest}
                    disabled={isBuddyRequestActionPending}
                    className="cursor-pointer rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-xs font-semibold text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50"
                  >
                    {cancelBuddyRequestMutation.isPending ? 'Cancelling…' : '🔥 Cancel Request'}
                  </button>
                )}
                {profile.buddyRelationshipStatus === 'pending_received' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => acceptBuddyMutation.mutate()}
                      disabled={isBuddyRequestActionPending}
                      className="cursor-pointer rounded-lg btn-primary-gradient px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {acceptBuddyMutation.isPending ? 'Accepting…' : '🔥 Accept'}
                    </button>
                    <button
                      onClick={() => declineBuddyMutation.mutate()}
                      disabled={isBuddyRequestActionPending}
                      className="cursor-pointer rounded-lg border border-gray-600 bg-transparent px-4 py-2 text-xs font-semibold text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50"
                    >
                      {declineBuddyMutation.isPending ? 'Declining…' : 'Decline'}
                    </button>
                  </div>
                )}
                {profile.buddyRelationshipStatus === 'none' && (
                  <button
                    onClick={() => requestBuddyMutation.mutate()}
                    disabled={requestBuddyMutation.isPending}
                    className="cursor-pointer rounded-lg btn-primary-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {requestBuddyMutation.isPending ? 'Sending…' : '🔥 Request Burn Buddy'}
                  </button>
                )}
              </div>
            </div>

            {/* Streak dots */}
            <div className="mb-5 flex flex-col gap-2">
              <StreakDots
                streakCount={profile.highestActiveStreak?.value ?? 0}
                last7Days={profile.highestActiveStreakLast7Days ?? EMPTY_LAST_7_DAYS}
                color="orange"
                label="Burn Streak"
              />
              <StreakDots
                streakCount={profile.highestActiveStreak?.value ?? 0}
                last7Days={profile.highestActiveStreakLast7Days ?? EMPTY_LAST_7_DAYS}
                color="violet"
                label="Supernova Streak"
              />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
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

            {/* Action buttons */}
            <div className="mt-6 flex flex-col gap-3 border-t border-gray-700 pt-6">
              {profile.buddyRelationshipStatus === 'buddies' && (
                <button
                  onClick={handleRemoveBuddy}
                  disabled={isActionPending}
                  className="w-full cursor-pointer rounded-lg border border-gray-600 bg-transparent px-4 py-2.5 text-sm font-semibold text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50"
                >
                  {removeBuddyMutation.isPending ? 'Removing…' : 'Remove Burn Buddy'}
                </button>
              )}
              <button
                onClick={handleRemoveFriend}
                disabled={isActionPending}
                className="w-full cursor-pointer rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
              >
                {removeFriendMutation.isPending ? 'Removing…' : 'Remove Friend'}
              </button>
            </div>
          </>
        )}
      </main>
  );
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
