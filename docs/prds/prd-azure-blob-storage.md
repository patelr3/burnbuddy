# PRD: Azure Blob Storage for Profile Pictures

## Introduction

Profile picture uploads are completely broken — the API returns "Storage service unavailable" because Firebase Storage was never provisioned for this project. Rather than provisioning Firebase Storage, we will replace it with Azure Blob Storage, which is a better fit for our Azure-native infrastructure (Container Apps, Key Vault, ACR). The API will authenticate to Azure Storage using its existing managed identity — no connection strings, no SAS tokens, no shared keys.

## Goals

- Fix the "Storage service unavailable" error that blocks all profile picture uploads
- Provision Azure Blob Storage accounts for beta and production environments
- Migrate the API's storage layer from Firebase Storage SDK to Azure Blob Storage SDK (`@azure/storage-blob`)
- Use managed identity exclusively for authentication (`DefaultAzureCredential`)
- Serve profile pictures via simple public blob URLs (no signed URLs needed)
- Update IaC (Bicep) and CI/CD (deploy workflow) to manage the new storage infrastructure

## User Stories

### US-001: Provision Azure Storage Account via Bicep
**Description:** As a DevOps engineer, I need Azure Storage Accounts provisioned via Bicep so that profile picture storage is managed as infrastructure-as-code.

**Acceptance Criteria:**
- [ ] New Bicep module `infra/modules/storage-account.bicep` creates a Storage Account with `Standard_LRS` SKU and `allowBlobPublicAccess: true`
- [ ] Module creates a blob container named `uploads` with `Blob` public access level (anonymous read for individual blobs, no container listing)
- [ ] Module assigns "Storage Blob Data Contributor" role to the API container app's managed identity
- [ ] Module outputs the storage account name and blob endpoint URL
- [ ] `infra/main.bicep` includes the new storage module and passes the blob endpoint URL to the API container app module
- [ ] `infra/modules/api-container-app.bicep` accepts a `storageAccountUrl` parameter and exposes it as `AZURE_STORAGE_ACCOUNT_URL` env var
- [ ] The `firebase-storage-bucket` KV secret reference is removed from the API container app Bicep
- [ ] Storage account names follow `burnbuddy{env}sa` pattern (e.g., `burnbuddybetasa`, `burnbuddyprodsa`)

### US-002: Rewrite storage library for Azure Blob Storage
**Description:** As a developer, I need the storage abstraction layer to use Azure Blob Storage so that route handlers can upload, delete, and reference blobs via managed identity.

**Acceptance Criteria:**
- [ ] `services/api/src/lib/storage.ts` is rewritten to use `@azure/storage-blob` and `@azure/identity`
- [ ] `getContainerClient(containerName)` returns a `ContainerClient` for the given container (e.g., `uploads`), authenticated via `DefaultAzureCredential`. Accepts a container name parameter for extensibility.
- [ ] `checkStorageConnectivity()` verifies the `uploads` container exists at startup and logs a warning if not (does NOT block startup)
- [ ] `getBlobUrl(blobPath)` returns the public URL for a blob (format: `{AZURE_STORAGE_ACCOUNT_URL}/uploads/{blobPath}`)
- [ ] Reads `AZURE_STORAGE_ACCOUNT_URL` env var (e.g., `https://burnbuddybetasa.blob.core.windows.net`)
- [ ] No connection string support — managed identity only
- [ ] `@azure/storage-blob` and `@azure/identity` packages are added to `services/api/package.json`
- [ ] Typecheck passes

### US-003: Remove Firebase Storage from Firebase initialization
**Description:** As a developer, I need to remove the `storageBucket` configuration from Firebase Admin initialization since Firebase is now only used for Auth and Firestore.

**Acceptance Criteria:**
- [ ] `storageBucket` parameter removed from all `admin.initializeApp()` calls in `services/api/src/lib/firebase.ts`
- [ ] `FIREBASE_STORAGE_BUCKET` env var is no longer read in `firebase.ts`
- [ ] Firebase Admin SDK continues to work for Auth verification and Firestore access
- [ ] Typecheck passes

### US-004: Update profile picture upload to use Azure Blob Storage
**Description:** As a user, I want to upload a profile picture so that it is stored in Azure Blob Storage and accessible via a public URL.

**Acceptance Criteria:**
- [ ] `POST /users/me/profile-picture` uses `blockBlobClient.upload()` instead of Firebase `storageFile.save()`
- [ ] Profile picture URL is a direct public blob URL with a cache-busting `?v={timestamp}` query param (`https://{account}.blob.core.windows.net/uploads/profile-pictures/{uid}/avatar.webp?v=1710000000`) — no signed URLs
- [ ] Blob is uploaded with `content-type: image/webp` and `cache-control: public, max-age=86400` headers
- [ ] Blob path is `profile-pictures/{uid}/avatar.webp` inside the `uploads` container
- [ ] On storage failure, returns 503 with `{ error: "Storage service unavailable. Please try again." }`
- [ ] Firestore `profilePictureUrl` field is updated with the new public URL (including `?v=` param)
- [ ] Existing sharp image processing (rotate, resize 256×256, WebP conversion) is unchanged
- [ ] Typecheck passes

### US-005: Update profile picture deletion to use Azure Blob Storage
**Description:** As a user, I want to delete my profile picture so that it is removed from Azure Blob Storage.

**Acceptance Criteria:**
- [ ] `DELETE /users/me/profile-picture` uses `blockBlobClient.deleteIfExists()` instead of Firebase `storageFile.delete()`
- [ ] Deletion is idempotent — succeeds even if no picture existed
- [ ] Firestore `profilePictureUrl` field is cleared
- [ ] Returns 204 on success
- [ ] Typecheck passes

### US-006: Update account deletion to clean up Azure Blob Storage
**Description:** As a user deleting my account, I want my profile picture to be removed from Azure Blob Storage as part of the cleanup.

**Acceptance Criteria:**
- [ ] `DELETE /users/me` uses `blockBlobClient.deleteIfExists()` for storage cleanup
- [ ] Storage deletion is idempotent (ignores missing blobs)
- [ ] Storage cleanup still happens before auth user deletion
- [ ] Non-404 storage errors are logged but do not fail the account deletion
- [ ] Typecheck passes

### US-007: Update diagnostics endpoint for Azure Blob Storage
**Description:** As a developer, I need the diagnostics endpoint to report Azure Blob Storage health so I can quickly verify storage connectivity.

**Acceptance Criteria:**
- [ ] `GET /diagnostics` reports Azure storage status instead of Firebase Storage
- [ ] Response includes: `storageAccountUrl`, `containerExists` (boolean), and `containerName`
- [ ] Reports error gracefully if storage is unreachable
- [ ] Typecheck passes

### US-008: Update test suites for Azure Blob Storage
**Description:** As a developer, I need all storage-related tests to mock Azure Blob Storage instead of Firebase Storage so the test suite passes.

**Acceptance Criteria:**
- [ ] `users-profile-picture.test.ts` mocks `@azure/storage-blob` — tests upload, URL generation, and error handling
- [ ] `users-delete-profile-picture.test.ts` mocks blob deletion and idempotent behavior
- [ ] `diagnostics.test.ts` mocks container existence check
- [ ] `delete-account.test.ts` mocks blob deletion during account cleanup
- [ ] All existing test scenarios still pass with the new mocks
- [ ] `cd services/api && yarn test` passes with zero failures

### US-009: Update deploy workflow for Azure Blob Storage
**Description:** As a DevOps engineer, I need the deploy workflow to configure Azure Storage instead of Firebase Storage so that deployments set the correct environment variables.

**Acceptance Criteria:**
- [ ] `.github/workflows/deploy-api.yml` no longer fetches `firebase-storage-bucket` from Key Vault
- [ ] Both beta and prod deploy jobs set `AZURE_STORAGE_ACCOUNT_URL` env var on the container app
- [ ] Beta uses `https://burnbuddybetasa.blob.core.windows.net`
- [ ] Prod uses `https://burnbuddyprodsa.blob.core.windows.net`
- [ ] `FIREBASE_STORAGE_BUCKET` is no longer set as an env var

### US-010: Provision beta storage and verify uploads
**Description:** As a developer, I need to provision the storage account for beta and verify that profile picture uploads work end-to-end.

**Acceptance Criteria:**
- [ ] Storage account `burnbuddybetasa` exists in `buddyburn-beta` resource group
- [ ] `uploads` container exists with Blob public access
- [ ] API container app's managed identity has "Storage Blob Data Contributor" role on the storage account
- [ ] `AZURE_STORAGE_ACCOUNT_URL` env var is set on the beta API container app
- [ ] API startup logs show successful storage connectivity check (no "does not exist" warning)
- [ ] Uploading a profile picture via the web app returns a working public URL
- [ ] The returned URL is accessible without authentication

## Functional Requirements

- FR-1: The system must use Azure Blob Storage (`@azure/storage-blob` SDK) for all profile picture storage operations
- FR-2: Authentication to Azure Storage must use `DefaultAzureCredential` (managed identity) exclusively — no connection strings, SAS tokens, or shared keys
- FR-3: Profile pictures must be stored at blob path `profile-pictures/{uid}/avatar.webp` inside the `uploads` container with public blob read access
- FR-4: Profile picture URLs must be direct public blob URLs with a cache-busting query param (format: `https://{account}.blob.core.windows.net/uploads/profile-pictures/{uid}/avatar.webp?v={timestamp}`)
- FR-10: Re-uploading a profile picture must produce a new URL (via updated `?v=` timestamp) so browsers/caches fetch the fresh image immediately
- FR-5: The storage account must be provisioned via Bicep with RBAC for the API's managed identity
- FR-6: The `AZURE_STORAGE_ACCOUNT_URL` env var must be the sole configuration for the storage endpoint
- FR-7: A non-blocking storage connectivity check must run at API startup and log warnings if the container is unreachable
- FR-8: All Firebase Storage references must be removed from the codebase (SDK calls, env vars, Bicep secrets, deploy workflow)
- FR-9: The Firebase Admin SDK must continue to function for Auth verification and Firestore access after storage removal

## Non-Goals

- No CDN or custom domain for blob storage URLs
- No migration of existing profile picture URLs (uploads have always been broken — no data to migrate)
- No connection string or SAS token authentication support
- No changes to image processing pipeline (sharp resize/WebP conversion stays as-is)
- No changes to mobile or web client upload code
- No Firebase Storage provisioning or troubleshooting

## Dependencies

None

## Technical Considerations

- **Managed Identity**: The API container app already has a system-assigned managed identity (`principalId: 71e4c958-eb58-4611-9c2f-6cb7d10502e6` in beta). The Bicep RBAC assignment grants it "Storage Blob Data Contributor" on the new storage account.
- **Public Access**: Azure Storage requires `allowBlobPublicAccess: true` at the account level AND `publicAccess: 'Blob'` at the container level. This is appropriate since profile pictures are displayed to other users.
- **Storage Account Naming**: Globally unique, 3-24 lowercase alphanumeric. Using `burnbuddybetasa` and `burnbuddyprodsa`.
- **`DefaultAzureCredential`**: In Azure, resolves to managed identity. Locally, resolves to az CLI credentials. No extra config needed.
- **Container name**: Using a generic `uploads` container (not `profile-pictures`) for extensibility — future uploads (squad photos, workout images) can use the same container with different blob path prefixes.
- **Blob path**: Using `profile-pictures/{uid}/avatar.webp` inside the `uploads` container, keeping the same logical path structure as the current Firebase implementation.
- **Cache busting**: Profile picture URLs include a `?v={unix-timestamp}` query param. When a user re-uploads, the new URL has a different timestamp, ensuring browsers and CDNs fetch the fresh image immediately despite `max-age=86400`.
- **Error handling**: Storage upload failures should still return 503 to match existing client error handling in both web and mobile apps.

## Success Metrics

- Profile picture uploads succeed on both web and mobile (currently 100% failure rate)
- API startup log shows "Storage container verified" instead of "Storage bucket does not exist"
- `/diagnostics` endpoint reports `containerExists: true`
- Profile picture URLs are publicly accessible without authentication

## Open Questions

None — all questions resolved:
- **Container name**: `uploads` (generic, extensible for future upload types)
- **Cache busting**: `?v={timestamp}` appended to profile picture URLs so re-uploads are immediately visible
- **Extensibility**: `getContainerClient(name)` accepts a container name parameter; storage module supports future use cases beyond profile pictures
