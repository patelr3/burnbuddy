'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useGroupWorkoutDetail } from '@/lib/queries';
import type { GroupWorkoutDetailParticipant } from '@/lib/queries';

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(startedAt: string, endedAt: string): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-7 w-48 rounded bg-gray-800" />
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-gray-700 p-4">
            <div className="mb-3 h-5 w-32 rounded bg-gray-800" />
            <div className="mb-2 h-4 w-24 rounded bg-gray-800" />
            <div className="flex gap-6">
              <div className="h-4 w-20 rounded bg-gray-800" />
              <div className="h-4 w-16 rounded bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ParticipantCard({
  participant,
  buddyId,
}: {
  participant: GroupWorkoutDetailParticipant;
  buddyId: string;
}) {
  const isActive = participant.status === 'active' && !participant.endedAt;

  return (
    <div className="rounded-lg border border-gray-700 bg-surface p-4">
      <Link
        href={`/burn-buddies/${buddyId}`}
        className="text-base font-semibold text-white no-underline hover:text-primary transition-colors"
      >
        {participant.displayName}
      </Link>

      <div className="mt-2 text-sm text-gray-400">{participant.workoutType}</div>

      <div className="mt-3 flex items-center gap-6 text-sm">
        <div>
          <span className="text-gray-500">Start </span>
          <span className="text-gray-300">{formatTime(participant.startedAt)}</span>
        </div>

        {isActive ? (
          <span className="inline-flex items-center rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-400">
            In Progress
          </span>
        ) : participant.endedAt ? (
          <div>
            <span className="text-gray-500">Duration </span>
            <span className="text-gray-300">
              {formatDuration(participant.startedAt, participant.endedAt)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function BurnBuddyGroupWorkoutDetailPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const buddyId = params['id'] as string;
  const gwId = params['gwId'] as string;

  const { data, isLoading, error } = useGroupWorkoutDetail(gwId);

  if (loading) return null;

  const is404 = error?.message?.includes('404');
  const is403 = error?.message?.includes('403');

  return (
    <main className="mx-auto max-w-xl px-4">
      {/* Header */}
      <div className="border-b border-gray-700 py-4 mb-6">
        <Link
          href={`/burn-buddies/${buddyId}`}
          className="text-sm text-gray-400 no-underline hover:text-gray-200"
        >
          ← Back to Buddy
        </Link>
        {data && (
          <h1 className="mt-2 text-xl font-bold text-white">{formatDate(data.startedAt)}</h1>
        )}
      </div>

      {/* Loading */}
      {isLoading && <DetailSkeleton />}

      {/* Error states */}
      {is404 && <p className="text-gray-400">Group workout not found.</p>}
      {is403 && <p className="text-gray-400">You don&apos;t have access to this group workout.</p>}
      {error && !is404 && !is403 && (
        <p className="text-gray-400">Something went wrong loading this workout.</p>
      )}

      {/* Participant cards */}
      {data && (
        <>
          <h2 className="mb-3 text-base font-semibold text-white">Participants</h2>
          <div className="space-y-3">
            {data.participants.map((p) => (
              <ParticipantCard key={p.uid} participant={p} buddyId={buddyId} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
