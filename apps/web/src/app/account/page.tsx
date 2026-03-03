'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPut } from '@/lib/api';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
    // newValue === false means "re-enable" (dismissed becomes false)
    // newValue === true means "dismiss again"
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

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  if (loading) return null;

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>
      {/* Nav bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 0',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 24,
        }}
      >
        <Link href="/" style={{ margin: 0, fontSize: 20, textDecoration: 'none', color: 'inherit', fontWeight: 'bold' }}>
          BurnBuddy
        </Link>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/friends" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
            Friends
          </Link>
        </div>
      </div>

      <h1 style={{ fontSize: 22, marginBottom: 24 }}>Account</h1>

      {dataLoading ? (
        <p style={{ color: '#6b7280' }}>Loading...</p>
      ) : (
        <>
          {/* Profile info */}
          <section
            style={{
              padding: '20px 24px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 16, marginBottom: 16, color: '#374151' }}>Profile</h2>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>Display Name</div>
              <div style={{ fontSize: 16, fontWeight: 'bold' }}>
                {user?.displayName ?? profile?.displayName ?? '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>Email</div>
              <div style={{ fontSize: 16 }}>{user?.email ?? profile?.email ?? '—'}</div>
            </div>
          </section>

          {/* Getting Started card toggle */}
          <section
            style={{
              padding: '20px 24px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 16, marginBottom: 8, color: '#374151' }}>Onboarding</h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
              {profile?.gettingStartedDismissed
                ? 'The Getting Started card is currently hidden on the home page.'
                : 'The Getting Started card is currently visible on the home page.'}
            </p>
            <button
              onClick={handleToggleGettingStarted}
              disabled={saving}
              style={{
                padding: '8px 16px',
                cursor: saving ? 'not-allowed' : 'pointer',
                backgroundColor: profile?.gettingStartedDismissed ? '#22c55e' : '#f97316',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {profile?.gettingStartedDismissed ? 'Re-enable Getting Started card' : 'Hide Getting Started card'}
            </button>
            {saveMessage && (
              <p style={{ fontSize: 13, color: '#6b7280', marginTop: 10 }}>{saveMessage}</p>
            )}
          </section>

          {/* Sign out */}
          <section
            style={{
              padding: '20px 24px',
              borderRadius: 8,
              border: '1px solid #fee2e2',
              backgroundColor: '#fff5f5',
            }}
          >
            <h2 style={{ fontSize: 16, marginBottom: 8, color: '#374151' }}>Sign Out</h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
              You will be redirected to the login page.
            </p>
            <button
              onClick={handleSignOut}
              style={{
                padding: '8px 20px',
                cursor: 'pointer',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 'bold',
              }}
            >
              Log Out
            </button>
          </section>
        </>
      )}
    </main>
  );
}
