'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import type { FriendRequest } from '@burnbuddy/shared';

interface FriendWithProfile {
  uid: string;
  displayName: string;
  email: string;
  createdAt: string;
}

interface UserSearchResult {
  uid: string;
  displayName: string;
  email: string;
}

interface EnrichedFriendRequest extends FriendRequest {
  displayName?: string;
}

export default function FriendsPage() {
  const { user, loading } = useAuth();

  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [incoming, setIncoming] = useState<EnrichedFriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<EnrichedFriendRequest[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Add friend state
  const [showSearch, setShowSearch] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState<UserSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Confirmation dialog state
  const [confirmUser, setConfirmUser] = useState<UserSearchResult | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setError(null);
    try {
      const [friendsList, requests] = await Promise.all([
        apiGet<FriendWithProfile[]>('/friends'),
        apiGet<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/friends/requests'),
      ]);
      setFriends(friendsList);

      const enrichReq = async (
        req: FriendRequest,
        uidField: 'fromUid' | 'toUid',
      ): Promise<EnrichedFriendRequest> => {
        try {
          const profile = await apiGet<UserSearchResult>(`/users/${req[uidField]}`);
          return { ...req, displayName: profile.displayName };
        } catch {
          return { ...req };
        }
      };

      const [enrichedIncoming, enrichedOutgoing] = await Promise.all([
        Promise.all(requests.incoming.map((r) => enrichReq(r, 'fromUid'))),
        Promise.all(requests.outgoing.map((r) => enrichReq(r, 'toUid'))),
      ]);

      setIncoming(enrichedIncoming);
      setOutgoing(enrichedOutgoing);
    } catch {
      setError('Failed to load friends');
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSearch = async () => {
    if (!searchEmail.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const result = await apiGet<UserSearchResult>(
        `/users/search?email=${encodeURIComponent(searchEmail.trim())}`,
      );
      setSearchResult(result);
    } catch {
      setSearchError('No user found with that email address');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectUser = (selected: UserSearchResult) => {
    setConfirmUser(selected);
  };

  const handleConfirmRequest = async () => {
    if (!confirmUser) return;
    setSendingRequest(true);
    try {
      await apiPost('/friends/requests', { toUid: confirmUser.uid });
      setConfirmUser(null);
      setShowSearch(false);
      setSearchEmail('');
      setSearchResult(null);
      await loadData();
    } catch {
      setError('Failed to send friend request');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await apiPost(`/friends/requests/${requestId}/accept`);
      await loadData();
    } catch {
      setError('Failed to accept friend request');
    }
  };

  const handleRemoveFriend = async (friendUid: string) => {
    try {
      await apiDelete(`/friends/${friendUid}`);
      setFriends((prev) => prev.filter((f) => f.uid !== friendUid));
    } catch {
      setError('Failed to remove friend');
    }
  };

  if (loading) return null;

  return (
    <main style={{ maxWidth: 600, margin: '80px auto', padding: '0 16px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0 }}>Friends</h1>
        <button
          onClick={() => {
            setShowSearch(!showSearch);
            setSearchEmail('');
            setSearchResult(null);
            setSearchError(null);
          }}
          style={{ padding: '8px 16px', cursor: 'pointer' }}
        >
          + Add Friend
        </button>
      </div>

      {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}

      {/* Add Friend search panel */}
      {showSearch && (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
            backgroundColor: '#f8fafc',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Search by Email</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="email"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              placeholder="friend@example.com"
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 4,
                border: '1px solid #d1d5db',
                fontSize: 14,
              }}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              style={{ padding: '8px 16px', cursor: 'pointer' }}
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {searchError && (
            <p style={{ color: 'red', margin: 0, fontSize: 14 }}>{searchError}</p>
          )}
          {searchResult && (
            <div
              onClick={() => handleSelectUser(searchResult)}
              style={{
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 4,
                cursor: 'pointer',
                backgroundColor: 'white',
              }}
            >
              <strong>{searchResult.displayName}</strong>
              <span style={{ color: '#6b7280', marginLeft: 8, fontSize: 14 }}>
                {searchResult.email}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 8,
              padding: 24,
              maxWidth: 400,
              width: '100%',
              margin: '0 16px',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Send Friend Request?</h3>
            <p>
              Send a friend request to <strong>{confirmUser.displayName}</strong> (
              {confirmUser.email})?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmUser(null)}
                style={{ padding: '8px 16px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRequest}
                disabled={sendingRequest}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  backgroundColor: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                }}
              >
                {sendingRequest ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dataLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          {/* Pending Requests */}
          {(incoming.length > 0 || outgoing.length > 0) && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, color: '#6b7280', marginBottom: 12 }}>
                Pending Requests
              </h2>

              {incoming.map((req) => (
                <div
                  key={req.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <div>
                    <strong>{req.displayName ?? req.fromUid}</strong>
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        color: '#22c55e',
                        backgroundColor: '#f0fdf4',
                        padding: '2px 8px',
                        borderRadius: 12,
                      }}
                    >
                      incoming
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleAcceptRequest(req.id)}
                      style={{
                        padding: '6px 12px',
                        cursor: 'pointer',
                        backgroundColor: '#22c55e',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => {
                        /* Ignore — deferred to v2 */
                      }}
                      style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              ))}

              {outgoing.map((req) => (
                <div
                  key={req.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <div>
                    <strong>{req.displayName ?? req.toUid}</strong>
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        color: '#6b7280',
                        backgroundColor: '#f1f5f9',
                        padding: '2px 8px',
                        borderRadius: 12,
                      }}
                    >
                      pending
                    </span>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Friends List */}
          <section>
            <h2 style={{ fontSize: 16, color: '#6b7280', marginBottom: 12 }}>
              Friends{friends.length > 0 ? ` (${friends.length})` : ''}
            </h2>
            {friends.length === 0 ? (
              <p style={{ color: '#9ca3af' }}>No friends yet. Add your first friend above!</p>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.uid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <div>
                    <strong>{friend.displayName}</strong>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{friend.email}</div>
                  </div>
                  <button
                    onClick={() => handleRemoveFriend(friend.uid)}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 13,
                      color: '#ef4444',
                      background: 'none',
                      border: '1px solid #fca5a5',
                      borderRadius: 4,
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
