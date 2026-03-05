/**
 * Shared Firebase Auth mock for mobile tests.
 *
 * Usage:
 *   import { mockFirebase, resetFirebaseMocks } from '../__mocks__/firebase';
 *
 * Then in your test file:
 *   jest.mock('../lib/firebase', () => mockFirebase);
 *   // — or —
 *   jest.mock('firebase/auth', () => mockFirebase.firebaseAuthModule);
 *
 * Call resetFirebaseMocks() in beforeEach to clear all mock state.
 *
 * The mock provides:
 *   - signInWithEmailAndPassword — resolves with { user: mockUser }
 *   - createUserWithEmailAndPassword — resolves with { user: mockUser }
 *   - onAuthStateChanged — calls callback with mockUser, returns unsubscribe fn
 *   - getIdToken — resolves with 'mock-id-token'
 *   - signOut — resolves void
 *   - auth — a mock Auth object with currentUser set to mockUser
 */

/** A minimal Firebase User-like object for testing. */
export const mockUser = {
  uid: 'test-uid-123',
  email: 'test@example.com',
  displayName: 'Test User',
  getIdToken: jest.fn().mockResolvedValue('mock-id-token'),
};

// --- Individual mock functions ---

export const mockSignInWithEmailAndPassword = jest
  .fn()
  .mockResolvedValue({ user: mockUser });

export const mockCreateUserWithEmailAndPassword = jest
  .fn()
  .mockResolvedValue({ user: mockUser });

/** Calls the callback immediately with mockUser and returns an unsubscribe fn. */
export const mockOnAuthStateChanged = jest
  .fn()
  .mockImplementation((auth: unknown, callback: (user: typeof mockUser | null) => void) => {
    callback(mockUser);
    return jest.fn(); // unsubscribe
  });

export const mockGetIdToken = jest.fn().mockResolvedValue('mock-id-token');

export const mockSignOut = jest.fn().mockResolvedValue(undefined);

/** Mock auth object matching the shape exported by lib/firebase.ts */
export const mockAuth = {
  currentUser: mockUser,
  onAuthStateChanged: mockOnAuthStateChanged,
};

// --- Pre-assembled mock modules ---

/**
 * Drop-in replacement for `jest.mock('firebase/auth', () => mockFirebase.firebaseAuthModule)`.
 * Provides all named exports that app code imports from 'firebase/auth'.
 */
export const firebaseAuthModule = {
  getAuth: jest.fn(() => mockAuth),
  signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
  createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword,
  onAuthStateChanged: mockOnAuthStateChanged,
  getIdToken: mockGetIdToken,
  signOut: mockSignOut,
  GoogleAuthProvider: jest.fn(),
  signInWithCredential: jest.fn().mockResolvedValue({ user: mockUser }),
};

/**
 * Pre-built mock for `jest.mock('../lib/firebase', () => mockFirebase.firebaseModule)`.
 * Matches the exports of lib/firebase.ts.
 */
export const firebaseModule = {
  auth: mockAuth,
};

/**
 * Resets all mock functions and restores default implementations.
 * Call in beforeEach() to get clean state per test.
 */
export function resetFirebaseMocks(): void {
  mockSignInWithEmailAndPassword.mockReset().mockResolvedValue({ user: mockUser });
  mockCreateUserWithEmailAndPassword.mockReset().mockResolvedValue({ user: mockUser });
  mockOnAuthStateChanged.mockReset().mockImplementation(
    (_auth: unknown, callback: (user: typeof mockUser | null) => void) => {
      callback(mockUser);
      return jest.fn();
    },
  );
  mockGetIdToken.mockReset().mockResolvedValue('mock-id-token');
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockUser.getIdToken.mockReset().mockResolvedValue('mock-id-token');
  mockAuth.currentUser = mockUser;
}
