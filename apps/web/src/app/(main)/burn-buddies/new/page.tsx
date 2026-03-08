'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPost } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
interface FriendWithProfile {
  uid: string;
  displayName: string;
  email: string;
}

export default function NewBurnBuddyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [selected, setSelected] = useState<FriendWithProfile | null>(null);
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

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    setError(null);
    try {
      await apiPost('/burn-buddies/requests', { toUid: selected.uid });
      router.push('/');
    } catch {
      setError('Failed to send Burn Buddy request. They may already have a pending request.');
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
          <h1 className="m-0 text-xl font-bold text-white">New Burn Buddy</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        <p className="mb-5 text-sm text-gray-400">
          Select a friend to send a Burn Buddy request to.
        </p>

        {dataLoading ? (
          <p className="text-gray-400">Loading friends…</p>
        ) : friends.length === 0 ? (
          <p className="text-gray-400">
            No friends yet.{' '}
            <Link href="/friends" className="text-primary no-underline hover:underline">
              Add friends first
            </Link>{' '}
            to create a Burn Buddy.
          </p>
        ) : (
          <div className="mb-6">
            {friends.map((friend) => (
              <div
                key={friend.uid}
                onClick={() => setSelected(selected?.uid === friend.uid ? null : friend)}
                className={`flex cursor-pointer items-center justify-between rounded-md border-2 p-3 mb-2 transition-colors ${
                  selected?.uid === friend.uid
                    ? 'border-primary bg-primary/20'
                    : 'border-gray-700 bg-surface hover:bg-surface-elevated'
                }`}
              >
                <div>
                  <div className="font-semibold text-white">{friend.displayName}</div>
                  <div className="text-[13px] text-gray-400">{friend.email}</div>
                </div>
                {selected?.uid === friend.uid && (
                  <span className="text-lg text-primary">✓</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Confirmation */}
        {selected && (
          <div className="mb-4 rounded-lg border border-gray-700 bg-surface p-4">
            <p className="mb-3 text-sm text-gray-300">
              Send a Burn Buddy request to <strong className="text-white">{selected.displayName}</strong>?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected(null)}
                className="cursor-pointer rounded-md border border-gray-600 bg-surface-elevated px-4 py-2 text-sm text-gray-300 hover:bg-gray-500/20"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="cursor-pointer rounded-md border-none btn-primary-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        )}
      </main>
  );
}
