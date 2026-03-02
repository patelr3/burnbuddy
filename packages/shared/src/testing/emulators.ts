/**
 * Firebase emulator test helper.
 * Call initTestAdmin() in your vitest setupFiles before tests run.
 * This module is for TEST USE ONLY — do not import in production code.
 */

/** Fixed ports for local Firebase emulators (matches firebase.json). */
export const EMULATOR_CONFIG = {
  auth: { host: 'localhost', port: 9099 },
  firestore: { host: 'localhost', port: 8080 },
} as const;

/**
 * Initializes firebase-admin against the local emulators when
 * FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST are set.
 * No-op when the env vars are absent — tests use vi.mock instead.
 */
export async function initTestAdmin(): Promise<void> {
  if (
    !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    !process.env.FIRESTORE_EMULATOR_HOST
  ) {
    return;
  }

  const { default: admin } = await import('firebase-admin');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID ?? 'burnbuddy-test',
    });
  }
}
