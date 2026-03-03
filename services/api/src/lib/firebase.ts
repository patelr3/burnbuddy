import admin from 'firebase-admin';

let initialized = false;

/**
 * Initialize firebase-admin. Safe to call multiple times.
 * When FIREBASE_AUTH_EMULATOR_HOST is set, the SDK automatically routes
 * auth calls to the local emulator (no real credentials needed).
 */
export function initFirebase(): void {
  if (initialized || admin.apps.length > 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'burnbuddy-dev';

  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    // Emulator mode — no service account required
    admin.initializeApp({ projectId });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Production mode — Application Default Credentials
    admin.initializeApp({ projectId });
  } else {
    // Dev mode without credentials — auth middleware will return 401 for all requests
    admin.initializeApp({ projectId });
  }

  initialized = true;
}

export { admin };
