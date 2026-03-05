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
