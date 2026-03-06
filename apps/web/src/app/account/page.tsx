'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPut } from '@/lib/api';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import { Avatar } from '@/components/Avatar';
import type { UserProfile } from '@burnbuddy/shared';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

function validateUsernameClient(username: string): string | null {
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (username.length > 30) return 'Username must be at most 30 characters';
  if (!USERNAME_REGEX.test(username)) return 'Only letters, numbers, and underscores allowed';
  return null;
}

export default function AccountPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [usernameFeedback, setUsernameFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
            {/* Profile info */}
            <section className="mb-5 rounded-lg border border-gray-200 p-5">
              <h2 className="mb-4 text-base font-semibold text-gray-700">Profile</h2>
              <div className="mb-4 flex items-center gap-4">
                <Avatar
                  displayName={user?.displayName ?? profile?.displayName ?? '?'}
                  profilePictureUrl={profile?.profilePictureUrl}
                  size="lg"
                />
                <div>
                  <div className="text-base font-bold">
                    {user?.displayName ?? profile?.displayName ?? '—'}
                  </div>
                  <div className="text-sm text-gray-500">{user?.email ?? profile?.email ?? '—'}</div>
                </div>
              </div>
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
