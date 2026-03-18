# PRD: Async Cartoon Conversion & Larger Upload Support

## Introduction

Profile picture uploads time out because the 60-second frontend timeout cannot accommodate Replicate's cartoon conversion (which can take 30-60+ seconds on cold start). Additionally, the 5 MB file size limit rejects some high-resolution phone photos, and the Replicate model parameters and output format need tuning.

This PRD makes cartoon conversion asynchronous — the upload endpoint returns immediately after storing the original image, and a background process converts it to a cartoon avatar. The frontend polls for completion. The file size limit is also increased to 15 MB. Images are stored and served as JPEG instead of WebP, and the Replicate model parameters are updated for better quality.

## Goals

- Eliminate "Upload timed out" errors by decoupling cartoon conversion from the upload request
- Support larger image uploads (up to 15 MB)
- Give Replicate more time to process (3-minute timeout) since it runs in the background
- Auto-update the UI when the cartoon avatar is ready (frontend polling)
- Keep the profile picture blank (no avatar) until the cartoon version is ready — the original photo is never displayed as the profile picture
- Use JPEG format for all stored profile pictures (original and cartoon avatar)
- Tune Replicate model parameters for better cartoon quality

## User Stories

### US-001: Update image format to JPEG and increase file size limit to 15 MB
**Description:** As a user, I want to upload high-resolution photos from my phone (including HEIC from iPhone) without hitting a file size error, and have my profile pictures stored as JPEG.

**Acceptance Criteria:**
- [ ] Multer file size limit in `services/api/src/routes/users.ts` increased from 5 MB to 15 MB
- [ ] Sharp pipeline changed from `.webp()` to `.jpeg({ quality: 90 })` for the optimized original — this converts all input formats (JPEG, PNG, WebP, HEIC, HEIF) to JPEG
- [ ] Blob paths changed from `.webp` to `.jpeg` (`original.jpeg`, `avatar.jpeg`)
- [ ] Blob `blobContentType` headers changed from `image/webp` to `image/jpeg`
- [ ] The JPEG original blob URL is what gets sent to Replicate — Replicate always receives a `.jpeg` URL, never raw HEIC or other formats
- [ ] Frontend error message in `apps/web/src/lib/api.ts` updated from "Maximum size is 5 MB" to "Maximum size is 15 MB"
- [ ] API 413 response message updated to reflect 15 MB limit
- [ ] Mobile app upload limit updated if applicable (check `apps/mobile/`)
- [ ] Typecheck passes
- [ ] Existing unit tests updated and passing (`cd services/api && yarn test -- users-profile-picture`)

### US-002: Add cartoon conversion status tracking
**Description:** As the system, I need to track the status of cartoon conversions so the frontend can poll for completion.

**Acceptance Criteria:**
- [ ] Add a `profilePictureStatus` field to the user's Firestore document with values: `'processing'` | `'ready'` | `null` (no picture)
- [ ] Add the `profilePictureStatus` field to the `UserProfile` type in `packages/shared/src/types.ts`
- [ ] When a profile picture upload begins, set `profilePictureStatus` to `'processing'` and clear `profilePictureUrl`
- [ ] When cartoon conversion completes, set `profilePictureStatus` to `'ready'` and set `profilePictureUrl` to the cartoon avatar URL
- [ ] When profile picture is deleted, set `profilePictureStatus` to `null` and clear `profilePictureUrl`
- [ ] Typecheck passes
- [ ] Build shared package successfully (`cd packages/shared && yarn build`)

### US-003: Update Replicate model parameters
**Description:** As the system, I need to use tuned Replicate model parameters for better cartoon quality.

**Acceptance Criteria:**
- [ ] Update `ReplicateCartoonService.createPrediction()` in `services/api/src/services/replicate-cartoon-service.ts` to use the following input parameters:
  ```json
  {
    "image": "<url>",
    "strength": 0.5,
    "guidance_scale": 6,
    "negative_prompt": "",
    "num_inference_steps": 20,
    "num_outputs": 1
  }
  ```
- [ ] Previous parameters (`strength: 0.7`, no `guidance_scale`/`negative_prompt`/`num_inference_steps`) are replaced
- [ ] Cartoon service downloads the Replicate output and converts to JPEG before uploading to blob storage (Replicate may return PNG)
- [ ] Unit tests updated to verify new parameters are sent (`cd services/api && yarn test -- cartoon-service`)
- [ ] Typecheck passes

### US-004: Make cartoon conversion async (fire-and-forget)
**Description:** As a user, I want my profile picture upload to complete quickly so I don't have to wait for cartoon conversion.

**Acceptance Criteria:**
- [ ] Upload endpoint (`POST /users/me/profile-picture`) returns immediately after uploading the original image to Azure Blob Storage and setting `profilePictureStatus` to `'processing'`
- [ ] Cartoon conversion runs as a fire-and-forget background task (not awaited in the request handler)
- [ ] Background task: calls Replicate, downloads result, uploads cartoon avatar to blob storage, updates Firestore with `profilePictureUrl` and `profilePictureStatus: 'ready'`
- [ ] If cartoon conversion fails, log the error and set `profilePictureStatus` to `'failed'` (so the user can retry)
- [ ] Replicate timeout increased from 60 seconds to 180 seconds (3 minutes)
- [ ] Upload endpoint response includes `{ profilePictureStatus: 'processing' }` (no `profilePictureUrl` yet)
- [ ] Typecheck passes
- [ ] Unit tests updated to verify async behavior (`cd services/api && yarn test -- users-profile-picture`)

### US-005: Add profile picture status polling endpoint
**Description:** As the frontend, I need an endpoint to check if the cartoon conversion is complete.

**Acceptance Criteria:**
- [ ] `GET /users/me` (existing endpoint) already returns `profilePictureUrl` and now also returns `profilePictureStatus`
- [ ] Alternatively, if a dedicated lightweight endpoint is preferred: `GET /users/me/profile-picture/status` returns `{ status: 'processing' | 'ready' | 'failed' | null }`
- [ ] Typecheck passes
- [ ] Unit tests cover all status values

### US-006: Frontend polling for cartoon completion
**Description:** As a user, I want my cartoon avatar to appear automatically when it's ready, without refreshing the page.

**Acceptance Criteria:**
- [ ] After a successful upload, the frontend polls `GET /users/me` every 5 seconds
- [ ] Polling stops when `profilePictureStatus` is `'ready'` or `'failed'`
- [ ] When `profilePictureStatus` is `'processing'`, show the default blank avatar (no profile picture)
- [ ] When `profilePictureStatus` becomes `'ready'`, update the displayed avatar with `profilePictureUrl`
- [ ] When `profilePictureStatus` is `'failed'`, show an error message indicating the user can retry
- [ ] Polling has a maximum duration (e.g., 3 minutes) after which it stops and shows a "try again" message
- [ ] Upload mutation no longer sets an optimistic `profilePictureUrl` preview (since the original is not displayed)
- [ ] Frontend timeout in `apiUploadFile` can remain at 60 seconds (upload is fast now without cartoon step)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Block upload/delete while cartoon conversion is processing
**Description:** As the system, I need to prevent the user from uploading a new picture or deleting their picture while cartoon conversion is in progress, to avoid race conditions.

**Acceptance Criteria:**
- [ ] API: `POST /users/me/profile-picture` returns 409 Conflict if `profilePictureStatus` is `'processing'`
- [ ] API: `DELETE /users/me/profile-picture` returns 409 Conflict if `profilePictureStatus` is `'processing'`
- [ ] Frontend: Upload and delete buttons are disabled when `profilePictureStatus` is `'processing'`
- [ ] Frontend: Show tooltip or message explaining why buttons are disabled (e.g., "Please wait for cartoon conversion to finish")
- [ ] Typecheck passes
- [ ] Unit tests cover 409 responses for both endpoints (`cd services/api && yarn test -- users-profile-picture`)

### US-008: Update frontend upload UX feedback
**Description:** As a user, I want to see clear status messages during the upload and conversion process.

**Acceptance Criteria:**
- [ ] During upload: show "Uploading..." spinner on the avatar area
- [ ] After upload returns (processing): show "Creating your cartoon avatar..." text near the avatar
- [ ] When cartoon is ready: show the cartoon avatar, remove processing text
- [ ] When cartoon fails: show "Cartoon conversion failed. Tap to retry." message
- [ ] File size validation message updated to "Maximum size is 15 MB"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Increase multer file size limit from 5 MB to 15 MB in API upload route
- FR-2: Update all user-facing file size error messages to say 15 MB
- FR-3: Change image output format from WebP to JPEG (sharp pipeline, blob paths, content types)
- FR-4: Update Replicate model input parameters: `strength: 0.5`, `guidance_scale: 6`, `negative_prompt: ""`, `num_inference_steps: 20`, `num_outputs: 1`
- FR-5: Add `profilePictureStatus` field (`'processing'` | `'ready'` | `'failed'` | `null`) to `UserProfile` type and Firestore documents
- FR-6: Upload endpoint returns immediately after storing original in blob storage, fires cartoon conversion in background
- FR-7: Background cartoon conversion updates Firestore `profilePictureUrl` and `profilePictureStatus` on completion or failure
- FR-8: Increase Replicate polling timeout from 60s to 180s (3 minutes)
- FR-9: Frontend polls `GET /users/me` every 5 seconds after upload, stops on `'ready'` or `'failed'`
- FR-10: Frontend shows blank avatar during `'processing'`, cartoon avatar when `'ready'`, retry prompt on `'failed'`
- FR-11: Errors in background cartoon conversion are logged but do not affect the upload response (which already returned 200)
- FR-12: Profile picture delete endpoint clears both `profilePictureUrl` and `profilePictureStatus`
- FR-13: Upload and delete endpoints return 409 Conflict when `profilePictureStatus` is `'processing'`
- FR-14: Frontend disables upload/delete buttons while `profilePictureStatus` is `'processing'`

## Non-Goals

- No WebSocket/SSE push notifications — polling is sufficient for this use case
- No queuing system (Bull, SQS, etc.) — fire-and-forget promise is adequate given the low volume
- Original photo is never stored as the profile picture or shown to other users
- No retry logic within the background task — if Replicate fails, user retries manually
- No changes to the cartoon model version on Replicate (keep `zf-kbot/photo-to-anime` v`3f91ee38...`)

## Dependencies

None

## Technical Considerations

- The background cartoon conversion runs as a fire-and-forget promise in the Express process. Errors must be caught and logged — unhandled rejections would crash the process. This follows the existing pattern used for group workout detection and push notifications.
- The `profilePictureStatus` field is a new addition to Firestore. No migration is needed — existing users without the field are treated as `null` (no picture processing in progress).
- The `original.webp` blob in Azure Storage is still kept as a backup (for potential future re-processing), but it is not referenced by `profilePictureUrl`.
- Sharp still resizes to 256×256 before blob upload and Replicate processing. The 15 MB limit is for the raw upload; the processed image sent to Replicate is much smaller.
- All stored images (original backup and cartoon avatar) use JPEG format (`.jpeg` extension, `image/jpeg` content type). The sharp pipeline converts any input format (JPEG, PNG, WebP, HEIC, HEIF) to JPEG before uploading to blob storage. Replicate always receives a JPEG URL — it never sees raw HEIC or other formats. Replicate may return PNG output — the cartoon service must convert to JPEG via sharp before uploading to blob storage.
- The existing `apiUploadFile` 60-second timeout is now sufficient since the upload no longer waits for cartoon conversion.

## Success Metrics

- Zero "Upload timed out" errors during profile picture upload
- Profile picture upload completes in under 5 seconds (network + sharp + blob upload)
- Cartoon avatar appears within 30-120 seconds after upload (depends on Replicate cold start)
- Users can upload photos up to 15 MB without errors

## Open Questions

- Should we add a maximum polling retry count (e.g., 36 polls × 5s = 3 min) or a time-based cutoff?
