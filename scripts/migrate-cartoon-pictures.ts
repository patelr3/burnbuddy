#!/usr/bin/env npx tsx
/**
 * Migration script: Convert existing users' profile pictures to cartoon style.
 *
 * Usage:
 *   npx tsx scripts/migrate-cartoon-pictures.ts [--dry-run] [--limit N]
 *
 * Required env vars:
 *   FIREBASE_PROJECT_ID          — Firebase project ID
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Service account JSON (or GOOGLE_APPLICATION_CREDENTIALS)
 *   AZURE_STORAGE_ACCOUNT_URL    — Azure Blob Storage account URL
 *   REPLICATE_API_TOKEN          — Replicate API token for cartoon conversion
 */

import admin from 'firebase-admin';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { ReplicateCartoonService } from '../services/api/src/services/replicate-cartoon-service';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  dryRun: boolean;
  limit: number | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--limit') {
      const next = args[i + 1];
      if (!next || isNaN(Number(next))) {
        console.error('Error: --limit requires a numeric argument');
        process.exit(1);
      }
      limit = Number(next);
      i++; // skip next arg
    } else {
      console.error(`Unknown argument: ${args[i]}`);
      console.error('Usage: npx tsx scripts/migrate-cartoon-pictures.ts [--dry-run] [--limit N]');
      process.exit(1);
    }
  }

  return { dryRun, limit };
}

// ---------------------------------------------------------------------------
// Firebase initialization
// ---------------------------------------------------------------------------

function initFirebase(): void {
  if (admin.apps.length > 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'burnbuddy-dev';
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
// Azure Blob Storage helpers
// ---------------------------------------------------------------------------

function getContainerClient(containerName: string = 'uploads') {
  const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
  if (!accountUrl) {
    throw new Error('AZURE_STORAGE_ACCOUNT_URL environment variable is not set');
  }
  const blobServiceClient = new BlobServiceClient(
    accountUrl,
    new DefaultAzureCredential(),
  );
  return blobServiceClient.getContainerClient(containerName);
}

function getBlobUrl(blobPath: string, containerName: string = 'uploads'): string {
  const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
  if (!accountUrl) {
    throw new Error('AZURE_STORAGE_ACCOUNT_URL environment variable is not set');
  }
  return `${accountUrl}/${containerName}/${blobPath}`;
}

// ---------------------------------------------------------------------------
// Migration logic
// ---------------------------------------------------------------------------

interface UserDoc {
  uid: string;
  profilePictureUrl: string;
}

async function fetchUsersWithProfilePictures(
  db: admin.firestore.Firestore,
  limit: number | null,
): Promise<UserDoc[]> {
  let query: admin.firestore.Query = db
    .collection('users')
    .where('profilePictureUrl', '!=', '');

  if (limit) {
    query = query.limit(limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({
    uid: doc.id,
    profilePictureUrl: doc.data().profilePictureUrl as string,
  }));
}

async function blobExists(containerClient: ReturnType<typeof getContainerClient>, blobPath: string): Promise<boolean> {
  const blobClient = containerClient.getBlockBlobClient(blobPath);
  return blobClient.exists();
}

async function downloadBlob(containerClient: ReturnType<typeof getContainerClient>, blobPath: string): Promise<Buffer> {
  const blobClient = containerClient.getBlockBlobClient(blobPath);
  const response = await blobClient.download(0);

  if (!response.readableStreamBody) {
    throw new Error(`No readable stream for blob: ${blobPath}`);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of response.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function uploadBlob(
  containerClient: ReturnType<typeof getContainerClient>,
  blobPath: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const blobClient = containerClient.getBlockBlobClient(blobPath);
  await blobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: {
      blobContentType: contentType,
      blobCacheControl: 'public, max-age=86400',
    },
  });
}

async function migrateUser(
  user: UserDoc,
  containerClient: ReturnType<typeof getContainerClient>,
  cartoonService: ReplicateCartoonService,
  db: admin.firestore.Firestore,
  dryRun: boolean,
): Promise<'skipped' | 'migrated' | 'failed'> {
  const originalPath = `profile-pictures/${user.uid}/original.webp`;
  const avatarPath = `profile-pictures/${user.uid}/avatar.webp`;

  // Idempotency: skip if original.webp already exists (already migrated)
  const originalExists = await blobExists(containerClient, originalPath);
  if (originalExists) {
    console.log(`  [SKIP] ${user.uid} — original.webp already exists (already migrated)`);
    return 'skipped';
  }

  // Check if avatar.webp exists (the current profile picture)
  const avatarExists = await blobExists(containerClient, avatarPath);
  if (!avatarExists) {
    console.log(`  [SKIP] ${user.uid} — no avatar.webp found in storage`);
    return 'skipped';
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] ${user.uid} — would download avatar.webp, back up as original.webp, cartoonize, and replace avatar.webp`);
    return 'migrated';
  }

  // Download current avatar
  console.log(`  Downloading avatar.webp for ${user.uid}...`);
  const avatarBuffer = await downloadBlob(containerClient, avatarPath);

  // Back up as original.webp
  console.log(`  Backing up as original.webp...`);
  await uploadBlob(containerClient, originalPath, avatarBuffer, 'image/webp');

  // Cartoonize using blob URL
  const originalBlobUrl = getBlobUrl(originalPath);
  console.log(`  Converting to cartoon style...`);
  const cartoonBuffer = await cartoonService.cartoonize(originalBlobUrl);

  // Upload cartoon as avatar.webp
  console.log(`  Uploading cartoon avatar...`);
  await uploadBlob(containerClient, avatarPath, cartoonBuffer, 'image/webp');

  // Update Firestore with cache-bust
  const profilePictureUrl = `${getBlobUrl(avatarPath)}?v=${Date.now()}`;
  console.log(`  Updating Firestore profilePictureUrl...`);
  await db.collection('users').doc(user.uid).update({ profilePictureUrl });

  console.log(`  [DONE] ${user.uid} — cartoon avatar created`);
  return 'migrated';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { dryRun, limit } = parseArgs();

  console.log('=== Cartoon Profile Picture Migration ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (limit !== null) {
    console.log(`Limit: ${limit} users`);
  }
  console.log('');

  // Initialize
  initFirebase();
  const db = admin.firestore();
  const containerClient = getContainerClient('uploads');
  const cartoonService = new ReplicateCartoonService();

  // Fetch users
  console.log('Fetching users with profile pictures...');
  const users = await fetchUsersWithProfilePictures(db, limit);
  console.log(`Found ${users.length} users with profile pictures.\n`);

  if (users.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  // Process sequentially to respect Replicate rate limits
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    console.log(`[${i + 1}/${users.length}] Processing ${user.uid}...`);

    try {
      const result = await migrateUser(user, containerClient, cartoonService, db, dryRun);
      if (result === 'migrated') migrated++;
      else if (result === 'skipped') skipped++;
      else failed++;
    } catch (err) {
      failed++;
      console.error(`  [ERROR] ${user.uid} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Summary
  console.log('\n=== Migration Summary ===');
  console.log(`Total users:  ${users.length}`);
  console.log(`Migrated:     ${migrated}`);
  console.log(`Skipped:      ${skipped}`);
  console.log(`Failed:       ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
