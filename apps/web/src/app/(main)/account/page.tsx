'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiPut, apiDelete, apiUploadFile } from '@/lib/api';
import { useAccount, queryKeys } from '@/lib/queries';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import type { UserProfile } from '@burnbuddy/shared';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

function validateUsernameClient(username: string): string | null {
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (username.length > 30) return 'Username must be at most 30 characters';
  if (!USERNAME_REGEX.test(username)) return 'Only letters, numbers, and underscores allowed';
  return null;
}

function AccountSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Profile section */}
      <div className="mb-5 rounded-lg border border-gray-700 p-5">
        <div className="mb-4 h-5 w-16 rounded bg-gray-800" />
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-800" />
          <div>
            <div className="mb-2 h-5 w-32 rounded bg-gray-800" />
            <div className="h-4 w-44 rounded bg-gray-800" />
          </div>
        </div>
      </div>
      {/* Username section */}
      <div className="mb-5 rounded-lg border border-gray-700 p-5">
        <div className="mb-4 h-5 w-24 rounded bg-gray-800" />
        <div className="mb-3 h-4 w-full rounded bg-gray-800" />
        <div className="flex items-start gap-3">
          <div className="h-10 flex-1 rounded-md bg-gray-800" />
          <div className="h-10 w-16 rounded-md bg-gray-800" />
        </div>
      </div>
      {/* Onboarding section */}
      <div className="mb-5 rounded-lg border border-gray-700 p-5">
        <div className="mb-2 h-5 w-28 rounded bg-gray-800" />
        <div className="mb-4 h-4 w-64 rounded bg-gray-800" />
        <div className="h-9 w-52 rounded-md bg-gray-800" />
      </div>
      {/* Sign out section */}
      <div className="rounded-lg border border-gray-700 p-5">
        <div className="mb-2 h-5 w-20 rounded bg-gray-800" />
        <div className="mb-4 h-4 w-56 rounded bg-gray-800" />
        <div className="h-9 w-24 rounded-md bg-gray-800" />
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading: dataLoading } = useAccount();

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [usernameSynced, setUsernameSynced] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [usernameFeedback, setUsernameFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [uploadError, setUploadError] = useState<string | null>(null);

  // Sync username from profile when it first loads
  useEffect(() => {
    if (profile && !usernameSynced) {
      setUsername(profile.username ?? '');
      setUsernameSynced(true);
    }
  }, [profile, usernameSynced]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const toggleGettingStartedMutation = useMutation({
    mutationFn: (newValue: boolean) => apiPut('/users/me', { gettingStartedDismissed: newValue }),
    onMutate: async (newValue) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.account });
      const previous = queryClient.getQueryData<UserProfile>(queryKeys.account);
      queryClient.setQueryData<UserProfile>(queryKeys.account, (old) =>
        old ? { ...old, gettingStartedDismissed: newValue } : old,
      );
      setSaveMessage(null);
      return { previous };
    },
    onSuccess: (_data, newValue) => {
      setSaveMessage(newValue ? 'Getting Started card hidden.' : 'Getting Started card re-enabled.');
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<UserProfile>(queryKeys.account, context.previous);
      }
      setSaveMessage('Failed to save. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.account });
    },
  });

  const usernameMutation = useMutation({
    mutationFn: (newUsername: string) => apiPut<UserProfile>('/users/me', { username: newUsername }),
    onMutate: async (newUsername) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.account });
      const previous = queryClient.getQueryData<UserProfile>(queryKeys.account);
      queryClient.setQueryData<UserProfile>(queryKeys.account, (old) =>
        old ? { ...old, username: newUsername } : old,
      );
      setUsernameFeedback(null);
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<UserProfile>(queryKeys.account, updated);
      setUsername(updated.username ?? '');
      setUsernameFeedback({ type: 'success', message: 'Username updated!' });
    },
    onError: (_err, _newUsername, context) => {
      if (context?.previous) {
        queryClient.setQueryData<UserProfile>(queryKeys.account, context.previous);
        setUsername(context.previous.username ?? '');
      }
      setUsernameFeedback({ type: 'error', message: 'Failed to save. Please try again.' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.account });
    },
  });

  const uploadPictureMutation = useMutation({
    mutationFn: (file: File) =>
      apiUploadFile<{ profilePictureUrl: string }>('/users/me/profile-picture', 'picture', file),
    onMutate: async (file) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.account });
      const previous = queryClient.getQueryData<UserProfile>(queryKeys.account);
      const previewUrl = URL.createObjectURL(file);
      queryClient.setQueryData<UserProfile>(queryKeys.account, (old) =>
        old ? { ...old, profilePictureUrl: previewUrl } : old,
      );
      setUploadError(null);
      return { previous, previewUrl };
    },
    onSuccess: (result) => {
      queryClient.setQueryData<UserProfile>(queryKeys.account, (old) =>
        old ? { ...old, profilePictureUrl: result.profilePictureUrl } : old,
      );
    },
    onError: (err, _file, context) => {
      if (context?.previous) {
        queryClient.setQueryData<UserProfile>(queryKeys.account, context.previous);
      }
      if (context?.previewUrl) {
        URL.revokeObjectURL(context.previewUrl);
      }
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    },
    onSettled: (_data, _error, _file, context) => {
      if (context?.previewUrl) {
        URL.revokeObjectURL(context.previewUrl);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.account });
    },
  });

  const removePictureMutation = useMutation({
    mutationFn: () => apiDelete('/users/me/profile-picture'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.account });
      const previous = queryClient.getQueryData<UserProfile>(queryKeys.account);
      queryClient.setQueryData<UserProfile>(queryKeys.account, (old) =>
        old ? { ...old, profilePictureUrl: undefined } : old,
      );
      setUploadError(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<UserProfile>(queryKeys.account, context.previous);
      }
      setUploadError('Failed to remove photo. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.account });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameFeedback(null);
    if (value.trim() === '') {
      setValidationError(null);
      return;
    }
    setValidationError(validateUsernameClient(value));
  };

  const handleUsernameSave = () => {
    const trimmed = username.trim();
    if (!trimmed) return;

    const clientError = validateUsernameClient(trimmed);
    if (clientError) {
      setValidationError(clientError);
      return;
    }

    if (trimmed === profile?.username) {
      setUsernameFeedback({ type: 'success', message: 'Username unchanged.' });
      return;
    }

    usernameMutation.mutate(trimmed);
  };

  const handlePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    uploadPictureMutation.mutate(file);
  };

  if (loading) return null;

  const isUsernameDirty = username.trim() !== (profile?.username ?? '');

  return (
      <main className="mx-auto max-w-xl px-4 pt-6 pb-12">
        <h1 className="mb-6 text-2xl font-bold">Account</h1>

        {dataLoading ? (
          <AccountSkeleton />
        ) : (
          <>
            {/* Profile info with picture upload */}
            <section className="mb-5 rounded-lg border border-gray-700 bg-surface p-5">
              <h2 className="mb-4 text-base font-semibold text-white">Profile</h2>
              <div className="mb-4 flex items-center gap-4">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadPictureMutation.isPending}
                    className="group relative cursor-pointer rounded-full border-none bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed"
                    aria-label="Change profile picture"
                  >
                    {uploadPictureMutation.isPending ? (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-pink-400">
                        <span className="animate-bounce text-lg">✨</span>
                      </div>
                    ) : (
                      <Avatar
                        displayName={user?.displayName ?? profile?.displayName ?? '?'}
                        profilePictureUrl={profile?.profilePictureUrl}
                        size="lg"
                      />
                    )}
                    {!uploadPictureMutation.isPending && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white/0 transition-all group-hover:bg-black/40 group-hover:text-white/100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4z" />
                          <path d="M10 12a3 3 0 100-6 3 3 0 000 6z" />
                        </svg>
                      </span>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES}
                    onChange={handlePictureUpload}
                    className="hidden"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <div className="text-base font-bold">
                    {user?.displayName ?? profile?.displayName ?? '—'}
                  </div>
                  <div className="text-sm text-gray-400">{user?.email ?? profile?.email ?? '—'}</div>
                  {uploadPictureMutation.isPending && (
                    <p className="mt-1 text-xs font-medium text-purple-400">✨ Anime-fying your photo…</p>
                  )}
                  {uploadError && (
                    <p className="mt-1 text-xs text-danger">{uploadError}</p>
                  )}
                </div>
              </div>
              {profile?.profilePictureUrl && !uploadPictureMutation.isPending && (
                <button
                  onClick={() => removePictureMutation.mutate()}
                  disabled={removePictureMutation.isPending}
                  className="cursor-pointer rounded-md border border-gray-600 bg-surface-elevated px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {removePictureMutation.isPending ? 'Removing…' : 'Remove photo'}
                </button>
              )}
            </section>

            {/* Username editing */}
            <section className="mb-5 rounded-lg border border-gray-700 bg-surface p-5">
              <h2 className="mb-4 text-base font-semibold text-white">Username</h2>
              <p className="mb-3 text-sm text-gray-400">
                Your username is how other users can find you. Letters, numbers, and underscores only (3–30 characters).
              </p>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-2 text-gray-400">@</span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      placeholder="username"
                      maxLength={30}
                      className="w-full rounded-md border border-gray-600 bg-surface-elevated py-2 pr-3 pl-7 text-sm text-white placeholder-gray-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  {validationError && (
                    <p className="mt-1 text-xs text-danger">{validationError}</p>
                  )}
                </div>
                <button
                  onClick={handleUsernameSave}
                  disabled={usernameMutation.isPending || !isUsernameDirty || !!validationError}
                  className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {usernameMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
              {usernameFeedback && (
                <p
                  className={`mt-2 text-sm ${usernameFeedback.type === 'success' ? 'text-success' : 'text-danger'}`}
                >
                  {usernameFeedback.message}
                </p>
              )}
            </section>

            {/* Getting Started card toggle */}
            <section className="mb-5 rounded-lg border border-gray-700 bg-surface p-5">
              <h2 className="mb-2 text-base font-semibold text-white">Onboarding</h2>
              <p className="mb-4 text-sm text-gray-400">
                {profile?.gettingStartedDismissed
                  ? 'The Getting Started card is currently hidden on the home page.'
                  : 'The Getting Started card is currently visible on the home page.'}
              </p>
              <button
                onClick={() => toggleGettingStartedMutation.mutate(!profile?.gettingStartedDismissed)}
                disabled={toggleGettingStartedMutation.isPending}
                className={`cursor-pointer rounded-md border-none px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                  profile?.gettingStartedDismissed
                    ? 'bg-success hover:bg-green-600'
                    : 'bg-primary hover:bg-orange-600'
                }`}
              >
                {profile?.gettingStartedDismissed ? 'Re-enable Getting Started card' : 'Hide Getting Started card'}
              </button>
              {saveMessage && (
                <p className="mt-2.5 text-[13px] text-gray-400">{saveMessage}</p>
              )}
            </section>

            {/* Sign out */}
            <section className="rounded-lg border border-red-500/30 bg-surface p-5">
              <h2 className="mb-2 text-base font-semibold text-white">Sign Out</h2>
              <p className="mb-4 text-sm text-gray-400">
                You will be redirected to the login page.
              </p>
              <button
                onClick={async () => {
                  await signOut(auth);
                  router.replace('/login');
                }}
                className="cursor-pointer rounded-md border-none bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-700"
              >
                Log Out
              </button>
            </section>
          </>
        )}
      </main>
  );
}
