#!/usr/bin/env npx tsx
/**
 * Relationship Integrity Repair Script
 *
 * Scans Firestore for inconsistent relationship states and repairs them.
 *
 * Usage:
 *   npx tsx scripts/repair-relationships.ts            # Dry-run (default)
 *   npx tsx scripts/repair-relationships.ts --fix       # Apply repairs
 *
 * Required env vars:
 *   FIREBASE_PROJECT_ID            — Firebase project ID
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — Service account JSON (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Detects and repairs:
 *   (a) Orphan pending burnBuddyRequests where a burnBuddy already exists
 *   (b) Orphan pending friendRequests where a friend document already exists
 *   (c) BurnBuddy documents without a corresponding friend document
 *   (d) Pending requests where one or both UIDs don't have a user profile
 */

import admin from 'firebase-admin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepairIssue {
  type:
    | 'orphan-bb-request'
    | 'orphan-friend-request'
    | 'bb-without-friend'
    | 'invalid-uid-request';
  docId: string;
  collection: string;
  details: string;
}

export interface RepairReport {
  orphanBBRequests: RepairIssue[];
  orphanFriendRequests: RepairIssue[];
  bbWithoutFriend: RepairIssue[];
  invalidUidRequests: RepairIssue[];
  totalScanned: number;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  dryRun: boolean;
  fix: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let fix = false;

  for (const arg of args) {
    if (arg === '--fix') {
      fix = true;
    } else if (arg === '--dry-run') {
      // explicit dry-run, no-op (it's the default)
    } else {
      console.error(`Unknown argument: ${arg}`);
      console.error(
        'Usage: npx tsx scripts/repair-relationships.ts [--dry-run] [--fix]',
      );
      process.exit(1);
    }
  }

  return { dryRun: !fix, fix };
}

// ---------------------------------------------------------------------------
// Firebase initialization
// ---------------------------------------------------------------------------

function initFirebase(): void {
  if (admin.apps.length > 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'burnbuddy-dev';
  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ??
    process.env.FIREBASE_SERVICE_ACCOUNT;

  let credential: admin.credential.Credential | undefined;
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      if (parsed.private_key && parsed.client_email) {
        credential = admin.credential.cert(parsed);
      }
    } catch {
      // Invalid JSON — fall through to default
    }
  }

  if (credential) {
    admin.initializeApp({ projectId, credential });
  } else {
    admin.initializeApp({ projectId });
  }
}

// ---------------------------------------------------------------------------
// Detection logic (exported for testing)
// ---------------------------------------------------------------------------

export async function detectIssues(
  db: admin.firestore.Firestore,
): Promise<RepairReport> {
  const report: RepairReport = {
    orphanBBRequests: [],
    orphanFriendRequests: [],
    bbWithoutFriend: [],
    invalidUidRequests: [],
    totalScanned: 0,
  };

  const [bbRequestsSnap, friendRequestsSnap, bbSnap, friendsSnap, usersSnap] =
    await Promise.all([
      db
        .collection('burnBuddyRequests')
        .where('status', '==', 'pending')
        .get(),
      db.collection('friendRequests').where('status', '==', 'pending').get(),
      db.collection('burnBuddies').get(),
      db.collection('friends').get(),
      db.collection('users').get(),
    ]);

  // Build lookup sets
  const userIds = new Set(usersSnap.docs.map((d) => d.id));

  const bbPairs = new Set(
    bbSnap.docs.map((d) => {
      const data = d.data();
      const [uid1, uid2] = [data.uid1, data.uid2].sort();
      return `${uid1}_${uid2}`;
    }),
  );

  const friendPairs = new Set(
    friendsSnap.docs.map((d) => {
      const data = d.data();
      const [uid1, uid2] = [data.uid1, data.uid2].sort();
      return `${uid1}_${uid2}`;
    }),
  );

  report.totalScanned =
    bbRequestsSnap.size + friendRequestsSnap.size + bbSnap.size;

  // (a) Orphan pending burnBuddyRequests where burnBuddy already exists
  for (const doc of bbRequestsSnap.docs) {
    const data = doc.data();
    const [uid1, uid2] = [data.fromUid, data.toUid].sort();
    const key = `${uid1}_${uid2}`;
    if (bbPairs.has(key)) {
      report.orphanBBRequests.push({
        type: 'orphan-bb-request',
        docId: doc.id,
        collection: 'burnBuddyRequests',
        details: `Orphan pending burnBuddyRequest ${doc.id} between ${data.fromUid} and ${data.toUid} — burnBuddy already exists`,
      });
    }
  }

  // (b) Orphan pending friendRequests where friend already exists
  for (const doc of friendRequestsSnap.docs) {
    const data = doc.data();
    const [uid1, uid2] = [data.fromUid, data.toUid].sort();
    const key = `${uid1}_${uid2}`;
    if (friendPairs.has(key)) {
      report.orphanFriendRequests.push({
        type: 'orphan-friend-request',
        docId: doc.id,
        collection: 'friendRequests',
        details: `Orphan pending friendRequest ${doc.id} between ${data.fromUid} and ${data.toUid} — friend already exists`,
      });
    }
  }

  // (c) BurnBuddy docs without corresponding friend doc
  for (const doc of bbSnap.docs) {
    const data = doc.data();
    const [uid1, uid2] = [data.uid1, data.uid2].sort();
    const key = `${uid1}_${uid2}`;
    if (!friendPairs.has(key)) {
      report.bbWithoutFriend.push({
        type: 'bb-without-friend',
        docId: doc.id,
        collection: 'burnBuddies',
        details: `BurnBuddy ${doc.id} between ${data.uid1} and ${data.uid2} has no corresponding friend document`,
      });
    }
  }

  // (d) Pending requests where one or both UIDs don't have a user profile
  for (const doc of bbRequestsSnap.docs) {
    const data = doc.data();
    if (!userIds.has(data.fromUid) || !userIds.has(data.toUid)) {
      const missing: string[] = [];
      if (!userIds.has(data.fromUid)) missing.push(data.fromUid);
      if (!userIds.has(data.toUid)) missing.push(data.toUid);
      report.invalidUidRequests.push({
        type: 'invalid-uid-request',
        docId: doc.id,
        collection: 'burnBuddyRequests',
        details: `Pending burnBuddyRequest ${doc.id} references non-existent user(s): ${missing.join(', ')}`,
      });
    }
  }

  for (const doc of friendRequestsSnap.docs) {
    const data = doc.data();
    if (!userIds.has(data.fromUid) || !userIds.has(data.toUid)) {
      const missing: string[] = [];
      if (!userIds.has(data.fromUid)) missing.push(data.fromUid);
      if (!userIds.has(data.toUid)) missing.push(data.toUid);
      report.invalidUidRequests.push({
        type: 'invalid-uid-request',
        docId: doc.id,
        collection: 'friendRequests',
        details: `Pending friendRequest ${doc.id} references non-existent user(s): ${missing.join(', ')}`,
      });
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Repair logic
// ---------------------------------------------------------------------------

const MAX_BATCH_SIZE = 500;

export async function applyRepairs(
  db: admin.firestore.Firestore,
  report: RepairReport,
): Promise<number> {
  const allIssues = [
    ...report.orphanBBRequests,
    ...report.orphanFriendRequests,
    ...report.bbWithoutFriend,
    ...report.invalidUidRequests,
  ];

  if (allIssues.length === 0) {
    console.log('No issues to repair.');
    return 0;
  }

  let totalRepaired = 0;

  for (let i = 0; i < allIssues.length; i += MAX_BATCH_SIZE) {
    const chunk = allIssues.slice(i, i + MAX_BATCH_SIZE);
    const batch = db.batch();

    for (const issue of chunk) {
      const ref = db.collection(issue.collection).doc(issue.docId);
      batch.delete(ref);
    }

    await batch.commit();
    totalRepaired += chunk.length;
    console.log(
      `  Committed batch ${Math.floor(i / MAX_BATCH_SIZE) + 1} (${chunk.length} ops)`,
    );
  }

  return totalRepaired;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printReport(report: RepairReport, dryRun: boolean): void {
  const mode = dryRun ? 'DRY-RUN' : 'FIX';
  console.log(`\n=== Relationship Integrity Report [${mode}] ===\n`);
  console.log(`Total documents scanned: ${report.totalScanned}`);

  const categories: Array<{
    label: string;
    issues: RepairIssue[];
  }> = [
    {
      label: 'Orphan pending burnBuddyRequests (burnBuddy exists)',
      issues: report.orphanBBRequests,
    },
    {
      label: 'Orphan pending friendRequests (friend exists)',
      issues: report.orphanFriendRequests,
    },
    {
      label: 'BurnBuddies without corresponding friend document',
      issues: report.bbWithoutFriend,
    },
    {
      label: 'Pending requests with non-existent user profiles',
      issues: report.invalidUidRequests,
    },
  ];

  let totalIssues = 0;
  for (const cat of categories) {
    console.log(`\n${cat.label}: ${cat.issues.length}`);
    for (const issue of cat.issues) {
      console.log(`  - ${issue.details}`);
    }
    totalIssues += cat.issues.length;
  }

  console.log(`\nTotal issues found: ${totalIssues}`);
  if (dryRun && totalIssues > 0) {
    console.log('\nRun with --fix to apply repairs.');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { dryRun } = parseArgs();

  console.log(
    `Starting relationship integrity scan (mode: ${dryRun ? 'dry-run' : 'fix'})...`,
  );

  initFirebase();
  const db = admin.firestore();

  const report = await detectIssues(db);
  printReport(report, dryRun);

  if (!dryRun) {
    const totalIssues =
      report.orphanBBRequests.length +
      report.orphanFriendRequests.length +
      report.bbWithoutFriend.length +
      report.invalidUidRequests.length;

    if (totalIssues > 0) {
      console.log('\nApplying repairs...');
      const repaired = await applyRepairs(db, report);
      console.log(`\nDone. Repaired ${repaired} documents.`);
    }
  }

  process.exit(0);
}

// Only run main when executed directly (not imported for testing)
const isDirectExecution =
  process.argv[1]?.endsWith('repair-relationships.ts') ||
  process.argv[1]?.endsWith('repair-relationships');

if (isDirectExecution) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
