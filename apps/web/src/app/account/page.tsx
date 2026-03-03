'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPut } from '@/lib/api';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import type { UserProfile } from '@burnbuddy/shared';

export default function AccountPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    try {
      const p = await apiGet<UserProfile>('/users/me');
      setProfile(p);
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

  if (loading) return null;

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-xl px-4">
        <h1 className="mb-6 mt-6 text-2xl font-bold">Account</h1>

        {dataLoading ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <>
            {/* Profile info */}
            <section className="mb-5 rounded-lg border border-gray-200 p-5">
              <h2 className="mb-4 text-base font-semibold text-gray-700">Profile</h2>
              <div className="mb-3">
                <div className="mb-0.5 text-xs text-gray-400">Display Name</div>
                <div className="text-base font-bold">
                  {user?.displayName ?? profile?.displayName ?? '—'}
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-xs text-gray-400">Email</div>
                <div className="text-base">{user?.email ?? profile?.email ?? '—'}</div>
              </div>
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
