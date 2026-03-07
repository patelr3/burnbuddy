'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth-context';

const FirebaseAuthWidget = dynamic(
  () => import('@/components/FirebaseAuthWidget'),
  { ssr: false },
);

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  if (loading || user) return null;

  return (
    <main className="max-w-md mx-auto mt-20 px-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-primary">🔥 BurnBuddy</h1>
        <p className="text-gray-500 mt-2">Motivate your buddies to burn calories</p>
      </div>
      <FirebaseAuthWidget />
    </main>
  );
}
