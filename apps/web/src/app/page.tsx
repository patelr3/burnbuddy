'use client';

import { useAuth } from '@/lib/auth-context';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  return (
    <main style={{ maxWidth: 600, margin: '80px auto', padding: '0 16px' }}>
      <h1>BurnBuddy</h1>
      <p>Motivate your buddies to burn calories.</p>
      {user && (
        <div>
          <p>Signed in as {user.displayName ?? user.email}</p>
          <button onClick={handleSignOut} style={{ padding: '8px 16px' }}>
            Sign out
          </button>
        </div>
      )}
    </main>
  );
}
