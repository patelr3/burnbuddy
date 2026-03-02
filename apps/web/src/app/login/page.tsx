'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || user) return null;

  return (
    <main style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
      <h1>Sign in to BurnBuddy</h1>
      <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ padding: 10 }}>
          Sign in
        </button>
      </form>
      <hr style={{ margin: '24px 0' }} />
      <button
        onClick={handleGoogleLogin}
        disabled={submitting}
        style={{ width: '100%', padding: 10 }}
      >
        Sign in with Google
      </button>
      <p style={{ marginTop: 24, textAlign: 'center' }}>
        Don&apos;t have an account?{' '}
        <a href="/signup">Sign up</a>
      </p>
    </main>
  );
}
