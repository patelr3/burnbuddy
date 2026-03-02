'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useAuth } from '@/lib/auth-context';

export default function SignupPage() {
  const [displayName, setDisplayName] = useState('');
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

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
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
      <h1>Create your BurnBuddy account</h1>
      <form onSubmit={handleEmailSignup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label htmlFor="name">Display Name</label>
          <br />
          <input
            id="name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </div>
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
          Sign up
        </button>
      </form>
      <hr style={{ margin: '24px 0' }} />
      <button
        onClick={handleGoogleSignup}
        disabled={submitting}
        style={{ width: '100%', padding: 10 }}
      >
        Sign up with Google
      </button>
      <p style={{ marginTop: 24, textAlign: 'center' }}>
        Already have an account?{' '}
        <a href="/login">Sign in</a>
      </p>
    </main>
  );
}
