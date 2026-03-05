'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet } from '@/lib/api';
import { NavBar } from '@/components/NavBar';
import type { UserProfile } from '@burnbuddy/shared';
import { getIdToken } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

function validateUsernameClient(username: string): string | null {
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (username.length > 30) return 'Username must be at most 30 characters';
  if (!USERNAME_REGEX.test(username)) return 'Only letters, numbers, and underscores allowed';
  return null;
}

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setFeedback(null);
    if (value.trim() === '') {
      setValidationError(null);
      return;
    }
    setValidationError(validateUsernameClient(value));
  };

  const handleSave = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;

    const clientError = validateUsernameClient(trimmed);
    if (clientError) {
      setValidationError(clientError);
      return;
    }

    if (trimmed === profile?.username) {
      setFeedback({ type: 'success', message: 'Username unchanged.' });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');
      const token = await getIdToken(firebaseUser);

      const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Something went wrong' }));
        setFeedback({ type: 'error', message: body.error ?? `Error ${res.status}` });
        return;
      }

      const updated = (await res.json()) as UserProfile;
      setProfile(updated);
      setUsername(updated.username ?? '');
      setFeedback({ type: 'success', message: 'Username updated!' });
    } catch {
      setFeedback({ type: 'error', message: 'Failed to save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const isDirty = username.trim() !== (profile?.username ?? '');

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-xl px-4 pt-6 pb-12">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

        {dataLoading ? (
          <p className="text-gray-500">Loading…</p>
        ) : (
          <>
            {/* Read-only profile info */}
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
                  onClick={handleSave}
                  disabled={saving || !isDirty || !!validationError}
                  className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {feedback && (
                <p
                  className={`mt-2 text-sm ${feedback.type === 'success' ? 'text-success' : 'text-danger'}`}
                >
                  {feedback.message}
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
