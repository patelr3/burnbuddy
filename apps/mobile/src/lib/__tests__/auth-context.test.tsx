import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  mockUser,
  mockOnAuthStateChanged,
  mockGetIdToken,
  resetFirebaseMocks,
} from '../../__mocks__/firebase';

// Mock firebase/auth and ../lib/firebase before importing the module under test.
// Use require() inside factories to avoid jest hoisting scope issues.
jest.mock('firebase/auth', () => require('../../__mocks__/firebase').firebaseAuthModule);
jest.mock('../firebase', () => require('../../__mocks__/firebase').firebaseModule);

import { AuthProvider, useAuth } from '../auth-context';

/** Convenience wrapper for renderHook that wraps children in AuthProvider. */
function renderAuthHook() {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    ),
  });
}

describe('AuthProvider / useAuth', () => {
  beforeEach(() => {
    resetFirebaseMocks();
  });

  it('renders children when onAuthStateChanged emits a user', async () => {
    const { result } = renderAuthHook();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
  });

  it('returns { user, loading, getToken } with correct values', async () => {
    const { result } = renderAuthHook();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(typeof result.current.getToken).toBe('function');
  });

  it('loading is true initially, then false after auth state resolves', async () => {
    // Make onAuthStateChanged NOT call the callback immediately so we can observe loading=true
    let authCallback: ((user: typeof mockUser | null) => void) | null = null;
    mockOnAuthStateChanged.mockImplementation(
      (_auth: unknown, cb: (user: typeof mockUser | null) => void) => {
        authCallback = cb;
        return jest.fn(); // unsubscribe
      },
    );

    const { result } = renderAuthHook();

    // Before callback fires, loading should be true
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();

    // Simulate auth resolving
    await act(async () => {
      authCallback!(mockUser);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toEqual(mockUser);
  });

  it('unauthenticated state (user is null) when onAuthStateChanged emits null', async () => {
    mockOnAuthStateChanged.mockImplementation(
      (_auth: unknown, cb: (user: typeof mockUser | null) => void) => {
        cb(null);
        return jest.fn();
      },
    );

    const { result } = renderAuthHook();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
  });

  it('getToken() calls Firebase getIdToken() and returns the token string', async () => {
    const { result } = renderAuthHook();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const token = await act(async () => {
      return result.current.getToken();
    });

    expect(mockGetIdToken).toHaveBeenCalledWith(mockUser);
    expect(token).toBe('mock-id-token');
  });

  it('getToken() returns null when user is not authenticated', async () => {
    mockOnAuthStateChanged.mockImplementation(
      (_auth: unknown, cb: (user: typeof mockUser | null) => void) => {
        cb(null);
        return jest.fn();
      },
    );

    const { result } = renderAuthHook();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const token = await act(async () => {
      return result.current.getToken();
    });

    expect(mockGetIdToken).not.toHaveBeenCalled();
    expect(token).toBeNull();
  });
});
