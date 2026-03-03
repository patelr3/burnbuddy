/**
 * Vitest global setup for services/api tests.
 * Initializes firebase-admin against local emulators when env vars are set.
 * When FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST are not present
 * (the common case in CI/devcontainer), this is a no-op and tests rely on
 * vi.mock to stub firebase-admin instead.
 */
import { initTestAdmin } from '../../packages/shared/src/testing/emulators';

await initTestAdmin();
