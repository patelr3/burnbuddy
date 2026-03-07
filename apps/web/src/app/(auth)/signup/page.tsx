'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function SignupPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    } else if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  // Brief fallback while redirecting
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">BurnBuddy</h1>
        <p className="mb-4 text-gray-600">
          Sign up on our{' '}
          <Link href="/login" className="font-semibold text-orange-500 hover:text-orange-600 underline">
            login page
          </Link>
        </p>
        <p className="text-sm text-gray-400">Redirecting…</p>
      </div>
    </main>
  );
}
