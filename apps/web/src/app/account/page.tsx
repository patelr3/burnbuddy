'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPut, apiDelete, apiUploadFile } from '@/lib/api';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
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

export default function AccountPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [usernameFeedback, setUsernameFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [showExtendedUpload, setShowExtendedUpload] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const cancelledRef = useRef(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    try {
      const p = await apiGet<UserProfile>('/users/me');
      setProfile(p);
      setUsername(p.username ?? '');
    } catch {
      // Profile may not exist yet
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!uploading) return;
    const timer = setTimeout(() => setShowExtendedUpload(true), 5000);
    return () => clearTimeout(timer);
  }, [uploading]);

  const handleToggleGettingStarted = async () => {
    const newValue = !profile?.gettingStartedDismissed;
    setSaving(true);
    setSaveMessage(null);
    try {
      await apiPut('/users/me', { gettingStartedDismissed: !profile?.gettingStartedDismissed });
      setProfile((prev) =>
        prev ? { ...prev, gettingStartedDismissed: !prev.gettingStartedDismissed } : prev,
      );
      setSaveMessage(newValue ? 'Getting Started card hidden.' : 'Getting Started card re-enabled.');
    } catch {
      setSaveMessage('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameFeedback(null);
    if (value.trim() === '') {
      setValidationError(null);
      return;
    }
    setValidationError(validateUsernameClient(value));
  };

  const handleUsernameSave = async () => {
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

    setUsernameSaving(true);
    setUsernameFeedback(null);

    try {
      const updated = await apiPut<UserProfile>('/users/me', { username: trimmed });
      setProfile(updated);
      setUsername(updated.username ?? '');
      setUsernameFeedback({ type: 'success', message: 'Username updated!' });
    } catch {
      setUsernameFeedback({ type: 'error', message: 'Failed to save. Please try again.' });
    } finally {
      setUsernameSaving(false);
    }
  };

  if (loading) return null;

  const uploadFile = async (file: File) => {
    lastFileRef.current = file;
    cancelledRef.current = false;
    setUploadError(null);
    setUploading(true);
    setShowExtendedUpload(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await apiUploadFile<{ profilePictureUrl: string }>(
        '/users/me/profile-picture',
        'picture',
        file,
        { signal: controller.signal },
      );
      setProfile((prev) => prev ? { ...prev, profilePictureUrl: result.profilePictureUrl } : prev);
      lastFileRef.current = null;
    } catch (err) {
      if (cancelledRef.current) {
        setUploadError(null);
      } else {
        setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
      setShowExtendedUpload(false);
      abortControllerRef.current = null;
    }
  };

  const handlePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await uploadFile(file);
  };

  const handleCancelUpload = () => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
  };

  const handleRetryUpload = () => {
    if (lastFileRef.current) {
      uploadFile(lastFileRef.current);
    }
  };

  const handlePictureRemove = async () => {
    setUploadError(null);
    setRemoving(true);
    try {
      await apiDelete('/users/me/profile-picture');
      setProfile((prev) => prev ? { ...prev, profilePictureUrl: undefined } : prev);
    } catch {
      setUploadError('Failed to remove photo. Please try again.');
    } finally {
      setRemoving(false);
    }
  };

  const isUsernameDirty = username.trim() !== (profile?.username ?? '');

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-xl px-4 pt-6 pb-12">
        <h1 className="mb-6 text-2xl font-bold">Account</h1>

        {dataLoading ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <>
            {/* Profile info with picture upload */}
            <section className="mb-5 rounded-lg border border-gray-200 p-5">
              <h2 className="mb-4 text-base font-semibold text-gray-700">Profile</h2>
              <div className="mb-4 flex items-center gap-4">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="group relative cursor-pointer rounded-full border-none bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed"
                    aria-label="Change profile picture"
                  >
                    {uploading ? (
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
                    {!uploading && (
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
                  <div className="text-sm text-gray-500">{user?.email ?? profile?.email ?? '—'}</div>
                  {uploading && (
                    <div className="mt-1">
                      <p className="text-xs font-medium text-purple-600">
                        {showExtendedUpload
                          ? '✨ Still working… this can take a moment for large photos'
                          : '✨ Anime-fying your photo…'}
                      </p>
                      {showExtendedUpload && (
                        <button
                          type="button"
                          onClick={handleCancelUpload}
                          className="mt-1 cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                  {uploadError && (
                    <div className="mt-1">
                      <p className="text-xs text-danger">{uploadError}</p>
                      {lastFileRef.current && (
                        <button
                          type="button"
                          onClick={handleRetryUpload}
                          className="mt-1 cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs text-purple-600 hover:bg-purple-50"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {profile?.profilePictureUrl && !uploading && (
                <button
                  onClick={handlePictureRemove}
                  disabled={removing}
                  className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {removing ? 'Removing…' : 'Remove photo'}
                </button>
              )}
            </section>

            {/* Username editing */}
            <section className="mb-5 rounded-lg border border-gray-200 p-5">
              <h2 className="mb-4 text-base font-semibold text-gray-700">Username</h2>
              <p className="mb-3 text-sm text-gray-500">
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
                      className="w-full rounded-md border border-gray-300 py-2 pr-3 pl-7 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  {validationError && (
                    <p className="mt-1 text-xs text-danger">{validationError}</p>
                  )}
                </div>
                <button
                  onClick={handleUsernameSave}
                  disabled={usernameSaving || !isUsernameDirty || !!validationError}
                  className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {usernameSaving ? 'Saving…' : 'Save'}
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
            <section className="mb-5 rounded-lg border border-gray-200 p-5">
              <h2 className="mb-2 text-base font-semibold text-gray-700">Onboarding</h2>
              <p className="mb-4 text-sm text-gray-500">
                {profile?.gettingStartedDismissed
                  ? 'The Getting Started card is currently hidden on the home page.'
                  : 'The Getting Started card is currently visible on the home page.'}
              </p>
              <button
                onClick={handleToggleGettingStarted}
                disabled={saving}
                className={`cursor-pointer rounded-md border-none px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                  profile?.gettingStartedDismissed
                    ? 'bg-success hover:bg-green-600'
                    : 'bg-primary hover:bg-orange-600'
                }`}
              >
                {profile?.gettingStartedDismissed ? 'Re-enable Getting Started card' : 'Hide Getting Started card'}
              </button>
              {saveMessage && (
                <p className="mt-2.5 text-[13px] text-gray-500">{saveMessage}</p>
              )}
            </section>

            {/* Sign out */}
            <section className="rounded-lg border border-red-200 bg-red-50 p-5">
              <h2 className="mb-2 text-base font-semibold text-gray-700">Sign Out</h2>
              <p className="mb-4 text-sm text-gray-500">
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
    </>
  );
}
