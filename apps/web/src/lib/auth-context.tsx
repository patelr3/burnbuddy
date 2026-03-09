'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type User, onAuthStateChanged, getIdToken } from 'firebase/auth';
import { auth } from './firebase-client';
import { apiPut } from './api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  getToken: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        document.cookie = 'auth_session=1; path=/; SameSite=Lax';

        // Detect browser timezone (gracefully skip if unavailable)
        let detectedTimezone: string | undefined;
        try {
          detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          // Intl API unavailable — skip timezone sync
        }

        // Ensure Firestore profile exists and sync timezone (fire-and-forget)
        apiPut('/users/me', {
          email: u.email,
          displayName: u.displayName,
          ...(detectedTimezone ? { timezone: detectedTimezone } : {}),
        }).catch((err) => {
          console.error('Failed to ensure Firestore profile:', err);
        });
      } else {
        document.cookie = 'auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      }
    });
    return unsubscribe;
  }, []);

  const getToken = async (): Promise<string | null> => {
    if (!user) return null;
    return getIdToken(user);
  };

  return (
    <AuthContext.Provider value={{ user, loading, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
