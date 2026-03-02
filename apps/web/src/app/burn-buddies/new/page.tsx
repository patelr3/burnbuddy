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
        <h1 style={{ margin: 0, fontSize: 20 }}>New Burn Buddy</h1>
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

      <p style={{ color: '#6b7280', marginBottom: 20, fontSize: 14 }}>
        Select a friend to send a Burn Buddy request to.
      </p>

      {dataLoading ? (
        <p style={{ color: '#6b7280' }}>Loading friends…</p>
      ) : friends.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>
          No friends yet.{' '}
          <Link href="/friends" style={{ color: '#22c55e' }}>
            Add friends first
          </Link>{' '}
          to create a Burn Buddy.
        </p>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {friends.map((friend) => (
            <div
              key={friend.uid}
              onClick={() => setSelected(selected?.uid === friend.uid ? null : friend)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                marginBottom: 8,
                borderRadius: 6,
                border: `2px solid ${selected?.uid === friend.uid ? '#22c55e' : '#e2e8f0'}`,
                backgroundColor: selected?.uid === friend.uid ? '#f0fdf4' : 'white',
                cursor: 'pointer',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{friend.displayName}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{friend.email}</div>
              </div>
              {selected?.uid === friend.uid && (
                <span style={{ color: '#22c55e', fontSize: 18 }}>✓</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirmation */}
      {selected && (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 16,
            backgroundColor: '#f8fafc',
            marginBottom: 16,
          }}
        >
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>
            Send a Burn Buddy request to <strong>{selected.displayName}</strong>?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setSelected(null)}
              style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 14 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
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
              {sending ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
