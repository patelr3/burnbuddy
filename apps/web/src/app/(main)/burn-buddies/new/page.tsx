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
        <div className="flex items-center gap-3 border-b border-gray-200 py-4 mb-6">
          <Link href="/" className="text-sm text-gray-500 no-underline hover:text-gray-700">
            ← Back
          </Link>
          <h1 className="m-0 text-xl font-bold">New Burn Buddy</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
            {error}
          </div>
        )}

        <p className="mb-5 text-sm text-gray-500">
          Select a friend to send a Burn Buddy request to.
        </p>

        {dataLoading ? (
          <p className="text-gray-500">Loading friends…</p>
        ) : friends.length === 0 ? (
          <p className="text-gray-400">
            No friends yet.{' '}
            <Link href="/friends" className="text-success no-underline hover:underline">
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
                    ? 'border-success bg-green-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div>
                  <div className="font-semibold">{friend.displayName}</div>
                  <div className="text-[13px] text-gray-500">{friend.email}</div>
                </div>
                {selected?.uid === friend.uid && (
                  <span className="text-lg text-success">✓</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Confirmation */}
        {selected && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm">
              Send a Burn Buddy request to <strong>{selected.displayName}</strong>?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected(null)}
                className="cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="cursor-pointer rounded-md border-none bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        )}
      </main>
  );
}
