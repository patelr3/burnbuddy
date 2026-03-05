import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateUniqueUsername } from './username';

/**
 * Minimal Firestore stub: collection('usernames').doc(id).get() returns
 * { exists: true/false } based on the `taken` set.
 */
function buildFakeDb(taken: Set<string>) {
  return {
    collection: (name: string) => {
      if (name !== 'usernames') throw new Error(`Unexpected collection: ${name}`);
      return {
        doc: (id: string) => ({
          get: vi.fn().mockResolvedValue({ exists: taken.has(id) }),
        }),
      };
    },
  } as unknown as FirebaseFirestore.Firestore;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('generateUniqueUsername', () => {
  it('derives username from email prefix', async () => {
    const db = buildFakeDb(new Set());
    const result = await generateUniqueUsername('alice@example.com', db);
    expect(result).toEqual({ username: 'alice', usernameLower: 'alice' });
  });

  it('appends suffix when base username is taken', async () => {
    const db = buildFakeDb(new Set(['bob']));
    const result = await generateUniqueUsername('bob@example.com', db);
    expect(result).toEqual({ username: 'bob2', usernameLower: 'bob2' });
  });

  it('increments suffix until a free username is found', async () => {
    const db = buildFakeDb(new Set(['carol', 'carol2', 'carol3']));
    const result = await generateUniqueUsername('carol@example.com', db);
    expect(result).toEqual({ username: 'carol4', usernameLower: 'carol4' });
  });

  it('lowercases the username for uniqueness check', async () => {
    const db = buildFakeDb(new Set());
    const result = await generateUniqueUsername('Alice.Smith@example.com', db);
    // Base derived from 'Alice.Smith' → strip non-alnum/underscore → 'AliceSmith'
    expect(result.usernameLower).toBe('alicesmith');
    expect(result.username).toBe('AliceSmith');
  });

  it('preserves original casing in username but uses lowercase for usernameLower', async () => {
    const db = buildFakeDb(new Set(['testuser']));
    const result = await generateUniqueUsername('TestUser@example.com', db);
    // 'testuser' taken → 'TestUser2'
    expect(result.username).toBe('TestUser2');
    expect(result.usernameLower).toBe('testuser2');
  });

  it('strips non-alphanumeric/underscore characters from email prefix', async () => {
    const db = buildFakeDb(new Set());
    const result = await generateUniqueUsername('john.doe+tag@example.com', db);
    expect(result.username).toBe('johndoetag');
    expect(result.usernameLower).toBe('johndoetag');
  });

  it('falls back to "user" when email prefix is empty after stripping', async () => {
    const db = buildFakeDb(new Set());
    const result = await generateUniqueUsername('...@example.com', db);
    expect(result.username).toBe('user');
    expect(result.usernameLower).toBe('user');
  });

  it('handles email with underscores correctly', async () => {
    const db = buildFakeDb(new Set());
    const result = await generateUniqueUsername('my_name@example.com', db);
    expect(result.username).toBe('my_name');
    expect(result.usernameLower).toBe('my_name');
  });
});
