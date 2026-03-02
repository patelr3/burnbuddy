'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiGet, apiPut } from '@/lib/api';
import { GettingStartedCard } from '@/components/GettingStartedCard';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@burnbuddy/shared';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiGet<UserProfile>('/users/me')
      .then((p) => {
        setProfile(p);
        setShowCard(!p.gettingStartedDismissed);
      })
      .catch(() => {
        // Profile not found yet — show card by default for new users
        setShowCard(true);
      });
  }, [user]);

  const handleDismiss = async () => {
    setShowCard(false);
    try {
      await apiPut('/users/me', { gettingStartedDismissed: true });
      if (profile) setProfile({ ...profile, gettingStartedDismissed: true });
    } catch {
      // Non-fatal — dismissed in UI even if API call fails
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  if (loading) return null;

  return (
    <main style={{ maxWidth: 600, margin: '80px auto', padding: '0 16px' }}>
      <h1>BurnBuddy</h1>
      <p>Motivate your buddies to burn calories.</p>
      {user && (
        <>
          {showCard && <GettingStartedCard onDismiss={handleDismiss} />}
          <div>
            <p>Signed in as {user.displayName ?? user.email}</p>
            <button onClick={handleSignOut} style={{ padding: '8px 16px' }}>
              Sign out
            </button>
          </div>
        </>
      )}
    </main>
  );
}
