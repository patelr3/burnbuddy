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
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;

  // Parse service account JSON from env var if available
  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? process.env.FIREBASE_SERVICE_ACCOUNT;
  let credential: admin.credential.Credential | undefined;
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      if (parsed.private_key && parsed.client_email) {
        credential = admin.credential.cert(parsed);
      }
    } catch {
      // Invalid JSON — fall through to default initialization
    }
  }

  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    // Emulator mode — no service account required
    admin.initializeApp({ projectId, storageBucket });
  } else if (credential) {
    // Production mode — explicit service account credentials
    admin.initializeApp({ projectId, credential, storageBucket });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Production mode — Application Default Credentials (file-based)
    admin.initializeApp({ projectId, storageBucket });
  } else {
    // Minimal mode — token verification still works (uses Google public keys)
    admin.initializeApp({ projectId, storageBucket });
  }

  initialized = true;
}

export { admin };
