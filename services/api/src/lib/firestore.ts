import { admin } from './firebase';
import type { Firestore } from 'firebase-admin/firestore';

let _db: Firestore | null = null;

/**
 * Returns the initialized Firestore instance.
 * Lazily initialized on first call; safe to call multiple times.
 */
export function getDb(): Firestore {
  if (!_db) {
    _db = admin.firestore();
  }
  return _db;
}
