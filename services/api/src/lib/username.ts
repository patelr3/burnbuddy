/**
 * Username generation and validation helpers.
 *
 * Usernames are derived from email prefixes and guaranteed unique via
 * the 'usernames' Firestore collection (doc ID = lowercase username).
 */

export interface UsernameResult {
  username: string;
  usernameLower: string;
}

/**
 * Derives a unique username from an email address.
 * Extracts the part before '@', strips non-alphanumeric/underscore chars,
 * then checks the 'usernames' collection for collisions, appending
 * incrementing numeric suffixes (name2, name3, …) until unique.
 */
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

/**
 * Validates a username string: alphanumeric and underscores only, 3-30 characters.
 * Returns null if valid, or a descriptive error string if invalid.
 */
export function validateUsername(username: string): string | null {
  if (username.length < 3) {
    return 'Username must be at least 3 characters';
  }
  if (username.length > 30) {
    return 'Username must be at most 30 characters';
  }
  if (!USERNAME_REGEX.test(username)) {
    return 'Username may only contain letters, numbers, and underscores';
  }
  return null;
}

export async function generateUniqueUsername(
  email: string,
  db: FirebaseFirestore.Firestore,
): Promise<UsernameResult> {
  const raw = email.split('@')[0] ?? 'user';
  // Keep only alphanumeric and underscores, fall back to 'user' if empty
  const base = raw.replace(/[^a-zA-Z0-9_]/g, '') || 'user';
  const baseLower = base.toLowerCase();

  // Check the base username first
  const baseDoc = await db.collection('usernames').doc(baseLower).get();
  if (!baseDoc.exists) {
    return { username: base, usernameLower: baseLower };
  }

  // Append incrementing suffixes until we find an available one
  let suffix = 2;
  while (true) {
    const candidate = `${baseLower}${suffix}`;
    const doc = await db.collection('usernames').doc(candidate).get();
    if (!doc.exists) {
      return { username: `${base}${suffix}`, usernameLower: candidate };
    }
    suffix++;
  }
}
