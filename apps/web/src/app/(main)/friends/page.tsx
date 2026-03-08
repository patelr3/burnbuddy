'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useFriends, queryKeys } from '@/lib/queries';
import type { FriendsData, FriendWithProfile } from '@/lib/queries';
import { Avatar } from '@/components/Avatar';
import Link from 'next/link';

interface UserSearchResult {
  uid: string;
  displayName: string;
  email: string;
  username?: string;
  profilePictureUrl?: string;
}

type BurnBuddyStatus = 'none' | 'pending' | 'buddy';

function FriendsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-3 h-4 w-32 rounded bg-gray-800" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="mb-2 flex items-center justify-between rounded-lg border border-gray-700 p-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-gray-800" />
            <div>
              <div className="mb-1 h-4 w-28 rounded bg-gray-800" />
              <div className="h-3 w-36 rounded bg-gray-800" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-7 w-24 rounded bg-gray-800" />
            <div className="h-7 w-16 rounded bg-gray-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FriendsPage() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading: dataLoading, error: queryError } = useFriends();

  const friends = data?.friends ?? [];
  const incoming = data?.friendRequests.incoming ?? [];
  const outgoing = data?.friendRequests.outgoing ?? [];
  const burnBuddies = data?.burnBuddies ?? [];
  const bbRequests = data?.burnBuddyRequests ?? { incoming: [], outgoing: [] };

  // Add friend state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Confirmation dialog state
  const [confirmUser, setConfirmUser] = useState<UserSearchResult | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);

  // Burn buddy state
  const [confirmBurnBuddy, setConfirmBurnBuddy] = useState<FriendWithProfile | null>(null);
  const [sendingBbRequest, setSendingBbRequest] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // ── Optimistic mutation: accept friend request ────────────────────────────
  const acceptMutation = useMutation({
    mutationFn: (requestId: string) => apiPost(`/friends/requests/${requestId}/accept`),
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.friends });
      const previous = queryClient.getQueryData<FriendsData>(queryKeys.friends);
      queryClient.setQueryData<FriendsData>(queryKeys.friends, (old) => {
        if (!old) return old;
        return {
          ...old,
          friendRequests: {
            ...old.friendRequests,
            incoming: old.friendRequests.incoming.filter((r) => r.id !== requestId),
          },
        };
      });
      return { previous };
    },
    onError: (_err, _requestId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.friends, context.previous);
      }
      setError('Failed to accept friend request');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
  });

  // ── Optimistic mutation: reject friend request ────────────────────────────
  const rejectMutation = useMutation({
    mutationFn: (requestId: string) => apiPost(`/friends/requests/${requestId}/reject`),
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.friends });
      const previous = queryClient.getQueryData<FriendsData>(queryKeys.friends);
      queryClient.setQueryData<FriendsData>(queryKeys.friends, (old) => {
        if (!old) return old;
        return {
          ...old,
          friendRequests: {
            ...old.friendRequests,
            incoming: old.friendRequests.incoming.filter((r) => r.id !== requestId),
          },
        };
      });
      return { previous };
    },
    onError: (_err, _requestId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.friends, context.previous);
      }
      setError('Failed to reject friend request');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
  });

  // ── Optimistic mutation: remove friend ────────────────────────────────────
  const removeFriendMutation = useMutation({
    mutationFn: (friendUid: string) => apiDelete(`/friends/${friendUid}`),
    onMutate: async (friendUid) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.friends });
      const previous = queryClient.getQueryData<FriendsData>(queryKeys.friends);
      queryClient.setQueryData<FriendsData>(queryKeys.friends, (old) => {
        if (!old) return old;
        return { ...old, friends: old.friends.filter((f) => f.uid !== friendUid) };
      });
      return { previous };
    },
    onError: (_err, _friendUid, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.friends, context.previous);
      }
      setError('Failed to remove friend');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    },
  });

  const getBurnBuddyStatus = useMemo(() => {
    return (friendUid: string): BurnBuddyStatus => {
      const isBuddy = burnBuddies.some(
        (bb) => bb.uid1 === friendUid || bb.uid2 === friendUid,
      );
      if (isBuddy) return 'buddy';

      const isPending =
        bbRequests.outgoing.some((r) => r.toUid === friendUid) ||
        bbRequests.incoming.some((r) => r.fromUid === friendUid);
      if (isPending) return 'pending';

      return 'none';
    };
  }, [burnBuddies, bbRequests]);

  const invalidateFriends = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: queryKeys.friends });
  }, [queryClient]);

  // Debounced typeahead search
  useEffect(() => {
    if (!showSearch) return;
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const results = await apiGet<UserSearchResult[]>(
          `/users/search?q=${encodeURIComponent(trimmed)}`,
        );
        setSearchResults(results);
        if (results.length === 0) {
          setSearchError('No users found');
        }
      } catch {
        setSearchResults([]);
        setSearchError('Search failed');
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, showSearch]);

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
      setSearchQuery('');
      setSearchResults([]);
      await invalidateFriends();
    } catch {
      setError('Failed to send friend request');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleSendBurnBuddyRequest = async () => {
    if (!confirmBurnBuddy) return;
    setSendingBbRequest(true);
    setError(null);
    try {
      await apiPost('/burn-buddies/requests', { toUid: confirmBurnBuddy.uid });
      setConfirmBurnBuddy(null);
      await invalidateFriends();
    } catch {
      setError('Failed to send Burn Buddy request. They may already have a pending request.');
    } finally {
      setSendingBbRequest(false);
    }
  };

  if (loading) return null;

  return (
      <main className="mx-auto max-w-xl px-4 pt-6 pb-12">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Friends</h1>
          <button
            onClick={() => {
              setShowSearch(!showSearch);
              setSearchQuery('');
              setSearchResults([]);
              setSearchError(null);
            }}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            + Add Friend
          </button>
        </div>

        {(error || queryError) && <div className="mb-4 text-sm text-danger">{error || 'Failed to load friends'}</div>}

        {/* Add Friend search panel */}
        {showSearch && (
          <div className="mb-6 rounded-lg border border-gray-700 bg-surface p-4">
            <h3 className="mb-3 text-base font-semibold text-white">Find a Friend</h3>
            <div className="relative mb-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username or email"
                autoFocus
                className="w-full rounded-md border border-gray-600 bg-surface-elevated px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
              {searching && (
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">Searching…</span>
              )}
            </div>
            {searchError && searchQuery.trim().length >= 2 && (
              <p className="mt-2 text-sm text-danger">{searchError}</p>
            )}
            {searchResults.length > 0 && (
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-700 bg-surface">
                {searchResults.map((u) => (
                  <li
                    key={u.uid}
                    onClick={() => handleSelectUser(u)}
                    className="cursor-pointer px-3 py-2.5 hover:bg-surface-elevated border-b border-gray-700 last:border-b-0"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar displayName={u.displayName} profilePictureUrl={u.profilePictureUrl} size="sm" />
                      <div>
                        <div>
                          <strong className="text-white">{u.displayName}</strong>
                          <span className="ml-2 text-sm text-gray-400">{u.email}</span>
                        </div>
                        {u.username && (
                          <div className="text-xs text-gray-400">@{u.username}</div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Confirmation dialog — friend request */}
        {confirmUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-sm rounded-lg border border-gray-700 bg-surface p-6">
              <h3 className="mb-2 text-lg font-semibold text-white">Send Friend Request?</h3>
              <p className="mb-4 text-sm text-gray-400">
                Send a friend request to <strong className="text-white">{confirmUser.displayName}</strong> (
                {confirmUser.email})?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmUser(null)}
                  className="cursor-pointer rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-surface-elevated"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRequest}
                  disabled={sendingRequest}
                  className="cursor-pointer rounded-md bg-success px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
                >
                  {sendingRequest ? 'Sending…' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation dialog — burn buddy request */}
        {confirmBurnBuddy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-sm rounded-lg border border-gray-700 bg-surface p-6">
              <h3 className="mb-2 text-lg font-semibold text-white">Send Burn Buddy Request?</h3>
              <p className="mb-4 text-sm text-gray-400">
                Send a Burn Buddy request to <strong className="text-white">{confirmBurnBuddy.displayName}</strong>?
                You&apos;ll be able to track workouts together and build streaks.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmBurnBuddy(null)}
                  className="cursor-pointer rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-surface-elevated"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendBurnBuddyRequest}
                  disabled={sendingBbRequest}
                  className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {sendingBbRequest ? 'Sending…' : '🔥 Send Request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {dataLoading ? (
          <FriendsSkeleton />
        ) : (
          <>
            {/* Pending Requests */}
            {(incoming.length > 0 || outgoing.length > 0) && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-semibold tracking-wide text-gray-400 uppercase">
                  Pending Requests
                </h2>

                {incoming.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg border border-gray-700 bg-surface p-3 mb-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar displayName={req.displayName ?? req.fromUid} profilePictureUrl={req.photoURL} size="sm" />
                      <div>
                        <strong className="text-white">{req.displayName ?? req.fromUid}</strong>
                        <span className="ml-2 inline-block rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-success">
                          incoming
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptMutation.mutate(req.id)}
                        disabled={acceptMutation.isPending}
                        className="cursor-pointer rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate(req.id)}
                        disabled={rejectMutation.isPending}
                        className="cursor-pointer rounded-md border border-gray-600 px-3 py-1.5 text-xs text-gray-400 hover:bg-surface-elevated disabled:opacity-50"
                      >
                        Ignore
                      </button>
                    </div>
                  </div>
                ))}

                {outgoing.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg border border-gray-700 bg-surface p-3 mb-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar displayName={req.displayName ?? req.toUid} profilePictureUrl={req.photoURL} size="sm" />
                      <div>
                        <strong className="text-white">{req.displayName ?? req.toUid}</strong>
                        <span className="ml-2 inline-block rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
                          pending
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Friends List */}
            <section>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-gray-400 uppercase">
                Friends{friends.length > 0 ? ` (${friends.length})` : ''}
              </h2>
              {friends.length === 0 ? (
                <p className="text-center text-gray-400">No friends yet. Add your first friend above!</p>
              ) : (
                friends.map((friend) => {
                  const bbStatus = getBurnBuddyStatus(friend.uid);
                  return (
                    <div
                      key={friend.uid}
                      className="flex items-center justify-between rounded-lg border border-gray-700 bg-surface p-3 mb-2 hover:bg-surface-elevated"
                    >
                      <Link
                        href={`/profile/${friend.uid}`}
                        className="min-w-0 flex-1 no-underline"
                      >
                        <div className="flex items-center gap-2.5">
                          <Avatar displayName={friend.displayName} profilePictureUrl={friend.profilePictureUrl} size="sm" />
                          <div>
                            <strong className="text-white">{friend.displayName}</strong>
                            {friend.username && (
                              <span className="ml-1.5 text-sm text-gray-400">@{friend.username}</span>
                            )}
                            <div className="text-xs text-gray-400">{friend.email}</div>
                          </div>
                        </div>
                      </Link>
                      <div className="flex items-center gap-2">
                        {bbStatus === 'buddy' && (
                          <span className="rounded-full bg-primary/20 px-2.5 py-1 text-xs font-medium text-primary">
                            🔥 Burn Buddy
                          </span>
                        )}
                        {bbStatus === 'pending' && (
                          <span className="rounded-full bg-yellow-500/20 px-2.5 py-1 text-xs font-medium text-yellow-400">
                            🔥 Pending
                          </span>
                        )}
                        {bbStatus === 'none' && (
                          <button
                            onClick={() => setConfirmBurnBuddy(friend)}
                            className="cursor-pointer rounded-md border border-primary/30 bg-transparent px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                          >
                            🔥 Burn Buddy
                          </button>
                        )}
                        <button
                          onClick={() => removeFriendMutation.mutate(friend.uid)}
                          disabled={removeFriendMutation.isPending}
                          className="cursor-pointer rounded-md border border-red-500/30 bg-transparent px-3 py-1.5 text-xs text-danger hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}
      </main>
  );
}
