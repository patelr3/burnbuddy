# PRD: Cartoon Profile Pictures

## Introduction

BurnBuddy currently displays users' raw profile photos throughout the app (web, mobile, API responses). To give the app a distinctive, fun identity, we want to automatically convert all profile pictures into a **bold cartoon / comic-book style** using an AI image transformation service.

The original photo will be preserved in Azure Blob Storage as a backup, but **only the cartoon version will ever be served to clients**. This applies to new uploads and existing users' photos (via a one-time migration).

**AI Service:** [Replicate](https://replicate.com) — a hosted ML model API with pay-per-use pricing, no infrastructure to deploy.

**Model:** [`zf-kbot/photo-to-anime`](https://replicate.com/zf-kbot/photo-to-anime) — converts photos to anime/cartoon style.
- **Version:** `3f91ee385785d4eb3dd6c14d2c80dcfd82d2b607fde4bdd610092c8fee8d81bb`
- **Input:** `image` (URL or base64 data URI), `strength` (0.0–1.0, default 0.5), `num_outputs` (1–4)
- **Output:** Array of image URLs (anime-styled versions)
- **Cost:** ~$0.0057 per image
- **Auth:** `Authorization: Token <REPLICATE_API_TOKEN>`

## Goals

- Convert every profile picture to a bold cartoon / comic-book style automatically on upload
- Preserve the original photo in Azure Blob Storage (never delete it)
- Never expose or display the original photo to any client — only the cartoon version
- Migrate all existing users' profile pictures to cartoon versions
- Abstract the AI service behind an interface so the provider/model can be swapped later
- Use the `zf-kbot/photo-to-anime` model on Replicate for the conversion

## User Stories

### US-001: Upload Profile Picture with Cartoon Conversion

**Description:** As a user, when I upload a new profile picture, the system processes it into a cartoon/comic-book style and displays only the cartoon version everywhere in the app.

**Acceptance Criteria:**
- [ ] User uploads a photo via web or mobile
- [ ] The API resizes and converts the photo to WebP (existing behavior)
- [ ] The resized original is saved to `profile-pictures/{uid}/original.webp` in Azure Blob Storage
- [ ] The resized original is sent to the Replicate API for cartoon conversion
- [ ] The cartoon result is saved to `profile-pictures/{uid}/avatar.webp` in Azure Blob Storage
- [ ] Firestore `profilePictureUrl` is updated to point to the cartoon `avatar.webp` with a cache-bust param
- [ ] The cartoon version is displayed in all Avatar components (web, mobile)
- [ ] The original photo URL is never returned in any API response

### US-002: Upload Failure on Cartoon Conversion Error

**Description:** As a user, if the cartoon conversion service fails, my upload fails with a clear error so I can retry.

**Acceptance Criteria:**
- [ ] If the Replicate API returns an error or times out, the upload endpoint returns HTTP 500
- [ ] The error response includes a user-friendly message (e.g., "Failed to create cartoon avatar. Please try again.")
- [ ] The original blob may be orphaned in storage (acceptable — overwritten on next attempt)
- [ ] Firestore `profilePictureUrl` is NOT updated on failure

### US-003: Delete Profile Picture Removes Both Versions

**Description:** As a user, when I remove my profile picture, both the original and cartoon versions are deleted from storage.

**Acceptance Criteria:**
- [ ] `DELETE /users/me/profile-picture` deletes `profile-pictures/{uid}/original.webp`
- [ ] `DELETE /users/me/profile-picture` deletes `profile-pictures/{uid}/avatar.webp`
- [ ] Both deletions are idempotent (no error if blob doesn't exist)
- [ ] Firestore `profilePictureUrl` field is removed

### US-004: Migrate Existing Users' Profile Pictures

**Description:** As an admin, I can run a one-time migration script to convert all existing users' profile pictures to cartoon versions.

**Acceptance Criteria:**
- [ ] Script queries Firestore for all users with `profilePictureUrl` set
- [ ] For each user, the current `avatar.webp` is downloaded and backed up as `original.webp`
- [ ] The photo is sent through the CartoonService for conversion
- [ ] The cartoon result replaces `avatar.webp` in blob storage
- [ ] Firestore URL is updated with a new cache-bust timestamp
- [ ] Script is idempotent — skips users whose `original.webp` already exists
- [ ] Script supports `--limit N` for testing with a subset
- [ ] Script supports `--dry-run` to preview actions without making changes
- [ ] Progress and errors are logged

### US-005: Loading UX During Cartoon Processing

**Description:** As a user, I see clear feedback during the longer upload process that my cartoon avatar is being created.

**Acceptance Criteria:**
- [ ] Web and mobile upload timeout is increased from 45s to 60s
- [ ] Loading text during upload shows "Creating your cartoon avatar..." (or similar)
- [ ] User can still cancel the upload

## Functional Requirements

- FR-1: Create a `CartoonService` interface in `services/api/src/services/cartoon-service.ts` with method `cartoonize(imageBuffer: Buffer, mimeType: string): Promise<Buffer>`
- FR-2: Implement `ReplicateCartoonService` class using the `zf-kbot/photo-to-anime` model (version `3f91ee38...`) with `strength: 0.7` and `num_outputs: 1`
- FR-3: `ReplicateCartoonService` must handle Replicate's async prediction flow (POST `/v1/predictions` → poll `GET /v1/predictions/{id}` until `succeeded` or `failed`)
- FR-4: Cartoon conversion must timeout after 30 seconds and throw a descriptive error
- FR-5: Read `REPLICATE_API_TOKEN` from environment variables (sourced from Azure Key Vault in production)
- FR-6: Modify `POST /users/me/profile-picture` to upload the resized original to `original.webp` before cartoon conversion
- FR-7: Modify `POST /users/me/profile-picture` to call `CartoonService.cartoonize()` and upload the result as `avatar.webp`
- FR-8: If cartoon conversion fails, return HTTP 500 and do not update Firestore
- FR-9: Modify `DELETE /users/me/profile-picture` to delete both `original.webp` and `avatar.webp` blobs
- FR-10: Add `REPLICATE_API_TOKEN` to Azure Key Vault for both beta and prod environments
- FR-11: Add Key Vault secret reference in `infra/modules/api-container-app.bicep` for the Replicate token
- FR-12: Create migration script at `scripts/migrate-cartoon-pictures.ts` with `--limit` and `--dry-run` flags
- FR-13: Increase `apiUploadFile` timeout to 60 seconds in both web and mobile API clients
- FR-14: Update upload loading UX text to indicate cartoon avatar creation
- FR-15: Add unit tests for the new upload flow, delete flow, and CartoonService mock behavior

## Non-Goals

- Changing Avatar component rendering logic (URL path unchanged — no display-layer changes needed)
- Supporting multiple cartoon styles or user style preferences
- Real-time preview of cartoon effect before upload
- Storing cartoon style metadata or AI model version in Firestore
- Building a queue-based async processing pipeline (synchronous is acceptable at current scale)

## Dependencies

- Replicate API account with billing enabled and an API token (manual setup — see Technical Considerations)
- `replicate` npm package (or raw HTTP calls to Replicate REST API)
- Existing Sharp image processing pipeline (no changes needed)
- Existing Azure Blob Storage infrastructure (no changes needed)

## Technical Considerations

### Storage Layout

| Blob Path | Purpose | Publicly Accessible? |
|-----------|---------|---------------------|
| `profile-pictures/{uid}/original.webp` | Original resized photo (backup) | Yes (blob-level), but URL never exposed to clients |
| `profile-pictures/{uid}/avatar.webp` | Cartoon version (displayed everywhere) | Yes |

Since `profilePictureUrl` in Firestore already points to `avatar.webp`, and the cartoon version replaces `avatar.webp` at the same path, **no changes are needed to any display components** (Avatar.tsx on web/mobile, profile endpoints, friend requests, squad members, etc.).

### Upload Flow (Updated)

```
User selects image
→ Frontend sends to POST /users/me/profile-picture (unchanged)
→ Multer parses file
→ Sharp: rotate, resize 256×256, convert to WebP → buffer
→ Upload buffer to profile-pictures/{uid}/original.webp (NEW: backup)
→ Call CartoonService.cartoonize(buffer) → cartoon buffer (NEW)
→ Upload cartoon buffer to profile-pictures/{uid}/avatar.webp
→ Update Firestore profilePictureUrl → avatar.webp?v={timestamp}
→ Return { profilePictureUrl } to client
```

### Replicate API Integration — `zf-kbot/photo-to-anime`

**Model:** `zf-kbot/photo-to-anime` ([docs](https://replicate.com/zf-kbot/photo-to-anime/api/api-reference))
**Version:** `3f91ee385785d4eb3dd6c14d2c80dcfd82d2b607fde4bdd610092c8fee8d81bb`

Replicate uses an async prediction model:
1. `POST /v1/predictions` — starts a prediction job with the image input
2. Poll `GET /v1/predictions/{id}` until status is `succeeded` or `failed`
3. Output is an array of image URLs — download `output[0]` as a buffer

**Authentication:** `Authorization: Token <REPLICATE_API_TOKEN>` (note: `Token`, not `Bearer`)

**Request body:**
```json
{
  "version": "3f91ee385785d4eb3dd6c14d2c80dcfd82d2b607fde4bdd610092c8fee8d81bb",
  "input": {
    "image": "https://burnbuddybetasa.blob.core.windows.net/uploads/profile-pictures/{uid}/original.webp",
    "strength": 0.7,
    "num_outputs": 1
  }
}
```

The image input can be a publicly accessible URL (our blobs are public) or a base64 data URI for images <256KB. Since our resized 256×256 WebP images are small, either approach works. Using the blob URL is simpler and avoids base64 overhead.

**Cost:** ~$0.0057 per prediction (~$0.57 per 100 users migrated)

### Migration Strategy

The migration script runs outside the API server as a standalone Node.js script:
1. Authenticates to Firestore and Azure Blob Storage using service account credentials
2. Queries all users with `profilePictureUrl` set
3. Processes sequentially (to respect Replicate rate limits)
4. Idempotent: checks for `original.webp` existence before processing
5. Run during low-traffic period due to potential rate limits

### Manual Setup Required (Before Implementation)

> **Status: DONE** — Replicate account is set up and `zf-kbot/photo-to-anime` model has been selected.

Remaining manual step before deployment:
1. **Add the API token to Azure Key Vault** for both environments:
   ```bash
   # Beta
   az keyvault secret set --vault-name buddyburn-beta-kv --name replicate-api-token --value "r8_YOUR_TOKEN_HERE"
   # Prod
   az keyvault secret set --vault-name buddyburn-prod-kv --name replicate-api-token --value "r8_YOUR_TOKEN_HERE"
   ```

## Success Metrics

- All new profile picture uploads produce a cartoon version within 15 seconds
- 100% of existing users with profile pictures are migrated to cartoon versions
- Zero original photos are exposed in any API response or client display
- Upload failure rate due to cartoon conversion stays below 5%
- No regressions in existing profile picture upload/delete/display functionality

## Open Questions

- ~~Which specific Replicate model to use?~~ → **Resolved: `zf-kbot/photo-to-anime`**
- What `strength` value produces the best results? → Start with 0.7, tune based on testing
- Should we add a "regenerate cartoon" button for users unhappy with their result? → Deferred to a future iteration
- If Replicate pricing becomes prohibitive at scale, should we switch to a self-hosted model? → Monitor costs; the `CartoonService` interface allows easy swapping
