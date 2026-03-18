import { describe, it, expect, vi, beforeEach } from 'vitest';
import type admin from 'firebase-admin';
import { detectIssues, applyRepairs, type RepairReport } from './repair-relationships';

// ---------------------------------------------------------------------------
// Mock Firestore helpers
// ---------------------------------------------------------------------------

interface MockDoc {
  id: string;
  data: () => Record<string, unknown>;
}

function mockSnapshot(docs: MockDoc[]) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
  };
}

function buildMockDb(collections: Record<string, { docs: MockDoc[]; queryDocs?: MockDoc[] }>) {
  const collectionFn = vi.fn((name: string) => {
    const col = collections[name] ?? { docs: [], queryDocs: [] };
    return {
      get: vi.fn().mockResolvedValue(mockSnapshot(col.docs)),
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(mockSnapshot(col.queryDocs ?? col.docs)),
      }),
      doc: vi.fn((id: string) => ({
        id,
        delete: vi.fn(),
      })),
    };
  });

  const mockBatchDelete = vi.fn();
  const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

  return {
    db: {
      collection: collectionFn,
      batch: vi.fn(() => ({
        delete: mockBatchDelete,
        commit: mockBatchCommit,
      })),
    } as unknown as admin.firestore.Firestore,
    mockBatchDelete,
    mockBatchCommit,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('repair-relationships', () => {
  describe('detectIssues', () => {
    it('detects orphan pending burnBuddyRequests where burnBuddy exists', async () => {
      const { db } = buildMockDb({
        burnBuddyRequests: {
          docs: [],
          queryDocs: [
            { id: 'req-1', data: () => ({ fromUid: 'alice', toUid: 'bob', status: 'pending' }) },
          ],
        },
        friendRequests: { docs: [], queryDocs: [] },
        burnBuddies: {
          docs: [
            { id: 'alice_bob', data: () => ({ uid1: 'alice', uid2: 'bob' }) },
          ],
        },
        friends: {
          docs: [
            { id: 'alice_bob', data: () => ({ uid1: 'alice', uid2: 'bob' }) },
          ],
        },
        users: {
          docs: [
            { id: 'alice', data: () => ({}) },
            { id: 'bob', data: () => ({}) },
          ],
        },
      });

      const report = await detectIssues(db);

      expect(report.orphanBBRequests).toHaveLength(1);
      expect(report.orphanBBRequests[0].docId).toBe('req-1');
      expect(report.orphanBBRequests[0].type).toBe('orphan-bb-request');
    });

    it('detects orphan pending friendRequests where friend exists', async () => {
      const { db } = buildMockDb({
        burnBuddyRequests: { docs: [], queryDocs: [] },
        friendRequests: {
          docs: [],
          queryDocs: [
            { id: 'freq-1', data: () => ({ fromUid: 'bob', toUid: 'alice', status: 'pending' }) },
          ],
        },
        burnBuddies: { docs: [] },
        friends: {
          docs: [
            { id: 'alice_bob', data: () => ({ uid1: 'alice', uid2: 'bob' }) },
          ],
        },
        users: {
          docs: [
            { id: 'alice', data: () => ({}) },
            { id: 'bob', data: () => ({}) },
          ],
        },
      });

      const report = await detectIssues(db);

      expect(report.orphanFriendRequests).toHaveLength(1);
      expect(report.orphanFriendRequests[0].docId).toBe('freq-1');
      expect(report.orphanFriendRequests[0].type).toBe('orphan-friend-request');
    });

    it('detects burnBuddies without corresponding friend document', async () => {
      const { db } = buildMockDb({
        burnBuddyRequests: { docs: [], queryDocs: [] },
        friendRequests: { docs: [], queryDocs: [] },
        burnBuddies: {
          docs: [
            { id: 'alice_charlie', data: () => ({ uid1: 'alice', uid2: 'charlie' }) },
          ],
        },
        friends: { docs: [] },
        users: {
          docs: [
            { id: 'alice', data: () => ({}) },
            { id: 'charlie', data: () => ({}) },
          ],
        },
      });

      const report = await detectIssues(db);

      expect(report.bbWithoutFriend).toHaveLength(1);
      expect(report.bbWithoutFriend[0].docId).toBe('alice_charlie');
      expect(report.bbWithoutFriend[0].type).toBe('bb-without-friend');
    });

    it('detects pending requests with non-existent user profiles', async () => {
      const { db } = buildMockDb({
        burnBuddyRequests: {
          docs: [],
          queryDocs: [
            { id: 'req-ghost', data: () => ({ fromUid: 'alice', toUid: 'ghost', status: 'pending' }) },
          ],
        },
        friendRequests: {
          docs: [],
          queryDocs: [
            { id: 'freq-ghost', data: () => ({ fromUid: 'phantom', toUid: 'alice', status: 'pending' }) },
          ],
        },
        burnBuddies: { docs: [] },
        friends: { docs: [] },
        users: {
          docs: [
            { id: 'alice', data: () => ({}) },
          ],
        },
      });

      const report = await detectIssues(db);

      expect(report.invalidUidRequests).toHaveLength(2);
      const bbIssue = report.invalidUidRequests.find((i) => i.collection === 'burnBuddyRequests');
      const frIssue = report.invalidUidRequests.find((i) => i.collection === 'friendRequests');
      expect(bbIssue?.details).toContain('ghost');
      expect(frIssue?.details).toContain('phantom');
    });

    it('reports no issues when data is consistent', async () => {
      const { db } = buildMockDb({
        burnBuddyRequests: { docs: [], queryDocs: [] },
        friendRequests: { docs: [], queryDocs: [] },
        burnBuddies: {
          docs: [
            { id: 'alice_bob', data: () => ({ uid1: 'alice', uid2: 'bob' }) },
          ],
        },
        friends: {
          docs: [
            { id: 'alice_bob', data: () => ({ uid1: 'alice', uid2: 'bob' }) },
          ],
        },
        users: {
          docs: [
            { id: 'alice', data: () => ({}) },
            { id: 'bob', data: () => ({}) },
          ],
        },
      });

      const report = await detectIssues(db);

      expect(report.orphanBBRequests).toHaveLength(0);
      expect(report.orphanFriendRequests).toHaveLength(0);
      expect(report.bbWithoutFriend).toHaveLength(0);
      expect(report.invalidUidRequests).toHaveLength(0);
    });

    it('handles mixed issues across all categories', async () => {
      const { db } = buildMockDb({
        burnBuddyRequests: {
          docs: [],
          queryDocs: [
            { id: 'req-orphan', data: () => ({ fromUid: 'alice', toUid: 'bob', status: 'pending' }) },
            { id: 'req-ghost', data: () => ({ fromUid: 'deleted-user', toUid: 'bob', status: 'pending' }) },
          ],
        },
        friendRequests: {
          docs: [],
          queryDocs: [
            { id: 'freq-orphan', data: () => ({ fromUid: 'bob', toUid: 'charlie', status: 'pending' }) },
          ],
        },
        burnBuddies: {
          docs: [
            { id: 'alice_bob', data: () => ({ uid1: 'alice', uid2: 'bob' }) },
            { id: 'bob_dave', data: () => ({ uid1: 'bob', uid2: 'dave' }) },
          ],
        },
        friends: {
          docs: [
            { id: 'alice_bob', data: () => ({ uid1: 'alice', uid2: 'bob' }) },
            { id: 'bob_charlie', data: () => ({ uid1: 'bob', uid2: 'charlie' }) },
          ],
        },
        users: {
          docs: [
            { id: 'alice', data: () => ({}) },
            { id: 'bob', data: () => ({}) },
            { id: 'charlie', data: () => ({}) },
            { id: 'dave', data: () => ({}) },
          ],
        },
      });

      const report = await detectIssues(db);

      // req-orphan: alice→bob pending, but alice_bob burnBuddy exists
      expect(report.orphanBBRequests).toHaveLength(1);
      expect(report.orphanBBRequests[0].docId).toBe('req-orphan');

      // freq-orphan: bob→charlie pending, but bob_charlie friend exists
      expect(report.orphanFriendRequests).toHaveLength(1);
      expect(report.orphanFriendRequests[0].docId).toBe('freq-orphan');

      // bob_dave burnBuddy has no friend doc
      expect(report.bbWithoutFriend).toHaveLength(1);
      expect(report.bbWithoutFriend[0].docId).toBe('bob_dave');

      // req-ghost references deleted-user
      expect(report.invalidUidRequests).toHaveLength(1);
      expect(report.invalidUidRequests[0].docId).toBe('req-ghost');

      expect(report.totalScanned).toBe(5); // 2 bb requests + 1 friend request + 2 burnBuddies
    });

    it('handles reverse direction in composite key correctly', async () => {
      // Request is bob→alice but burnBuddy is alice_bob (sorted) — should still detect
      const { db } = buildMockDb({
        burnBuddyRequests: {
          docs: [],
          queryDocs: [
            { id: 'req-rev', data: () => ({ fromUid: 'bob', toUid: 'alice', status: 'pending' }) },
          ],
        },
        friendRequests: { docs: [], queryDocs: [] },
        burnBuddies: {
          docs: [
            { id: 'alice_bob', data: () => ({ uid1: 'alice', uid2: 'bob' }) },
          ],
        },
        friends: {
          docs: [
            { id: 'alice_bob', data: () => ({ uid1: 'alice', uid2: 'bob' }) },
          ],
        },
        users: {
          docs: [
            { id: 'alice', data: () => ({}) },
            { id: 'bob', data: () => ({}) },
          ],
        },
      });

      const report = await detectIssues(db);

      expect(report.orphanBBRequests).toHaveLength(1);
      expect(report.orphanBBRequests[0].docId).toBe('req-rev');
    });
  });

  describe('applyRepairs', () => {
    it('deletes all issue documents in batched writes', async () => {
      const { db, mockBatchDelete, mockBatchCommit } = buildMockDb({
        burnBuddyRequests: { docs: [] },
        friendRequests: { docs: [] },
        burnBuddies: { docs: [] },
        friends: { docs: [] },
        users: { docs: [] },
      });

      const report: RepairReport = {
        orphanBBRequests: [
          { type: 'orphan-bb-request', docId: 'req-1', collection: 'burnBuddyRequests', details: 'test' },
        ],
        orphanFriendRequests: [
          { type: 'orphan-friend-request', docId: 'freq-1', collection: 'friendRequests', details: 'test' },
        ],
        bbWithoutFriend: [
          { type: 'bb-without-friend', docId: 'bb-1', collection: 'burnBuddies', details: 'test' },
        ],
        invalidUidRequests: [
          { type: 'invalid-uid-request', docId: 'req-ghost', collection: 'burnBuddyRequests', details: 'test' },
        ],
        totalScanned: 10,
      };

      const repaired = await applyRepairs(db, report);

      expect(repaired).toBe(4);
      expect(mockBatchDelete).toHaveBeenCalledTimes(4);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });

    it('returns 0 when no issues to repair', async () => {
      const { db, mockBatchCommit } = buildMockDb({
        burnBuddyRequests: { docs: [] },
        friendRequests: { docs: [] },
        burnBuddies: { docs: [] },
        friends: { docs: [] },
        users: { docs: [] },
      });

      const report: RepairReport = {
        orphanBBRequests: [],
        orphanFriendRequests: [],
        bbWithoutFriend: [],
        invalidUidRequests: [],
        totalScanned: 0,
      };

      const repaired = await applyRepairs(db, report);

      expect(repaired).toBe(0);
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });
  });
});
