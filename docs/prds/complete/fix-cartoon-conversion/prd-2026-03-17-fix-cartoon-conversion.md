# PRD: Fix Cartoon Profile Picture Conversion

## Introduction

The cartoon profile pictures feature was merged in PR #84, but the anime/cartoon conversion **does not actually work in production**. Several implementation issues prevent the Replicate `zf-kbot/photo-to-anime` model from successfully converting uploaded profile pictures.

This PRD describes the bugs found, what needs to be fixed, and how to verify the fixes.

## Problem Statement

The current implementation in `services/api/src/services/replicate-cartoon-service.ts` sends images as **base64 data URIs** embedded in the JSON request body to the Replicate API. This approach has multiple problems:

1. **Unnecessary base64 overhead**: The original resized image is already uploaded to a publicly accessible Azure Blob Storage URL (`profile-pictures/{uid}/original.webp`) BEFORE the cartoon conversion is attempted. The PRD for the feature explicitly stated: *"Using the blob URL is simpler and avoids base64 overhead."*

2. **No graceful fallback**: When `REPLICATE_API_TOKEN` is not set (common in dev/test environments), the `ReplicateCartoonService` constructor throws immediately, causing ALL profile picture uploads to fail with HTTP 500. There is no passthrough/skip mode.

3. **Timeout too aggressive**: The 30-second timeout (`TIMEOUT_MS = 30_000`) is barely sufficient. Replicate models often need 10-20s for cold starts plus 5-15s for inference. A single slow poll cycle can push past 30s.

4. **CartoonService interface is too narrow**: The interface only accepts `(imageBuffer: Buffer, mimeType: string)`, making it impossible to pass a blob URL to the Replicate API. The interface needs to support URL-based input.

5. **Migration script has same issue**: `scripts/migrate-cartoon-pictures.ts` passes buffers through `cartoonize()`, which encodes them as base64 instead of using the already-public blob URLs.

## Goals

- Make cartoon conversion actually work by using blob URLs instead of base64 data URIs
- Add a graceful fallback (passthrough) when `REPLICATE_API_TOKEN` is not configured
- Increase timeout to handle Replicate cold starts
- Update the CartoonService interface to support URL-based input
- Fix the migration script to use URLs
- Ensure all existing tests pass and add tests for the new fallback behavior

## User Stories

### US-001: Use Blob URL Instead of Base64 for Cartoon Conversion

**Description:** Refactor the cartoon conversion to pass the publicly accessible Azure Blob Storage URL of the uploaded original image to the Replicate API, instead of encoding the image buffer as a base64 data URI.

**Acceptance Criteria:**
- [ ] `CartoonService` interface updated: `cartoonize` method accepts an image URL string (the public blob URL) instead of / in addition to a raw Buffer
- [ ] `ReplicateCartoonService.cartoonize()` sends the image URL directly in the Replicate prediction `input.image` field
- [ ] No base64 encoding of image buffers occurs in the cartoon conversion flow
- [ ] The upload endpoint in `services/api/src/routes/users.ts` constructs the blob URL for the uploaded original and passes it to `cartoonize()`
- [ ] The migration script in `scripts/migrate-cartoon-pictures.ts` uses blob URLs instead of buffers for the cartoon service
- [ ] All existing cartoon service tests are updated to reflect the new URL-based interface
- [ ] All existing profile picture upload tests continue to pass

### US-002: Add Graceful Fallback When Replicate Token Is Missing

**Description:** When `REPLICATE_API_TOKEN` is not configured, profile picture uploads should still succeed by skipping the cartoon conversion and using the original image directly as the avatar.

**Acceptance Criteria:**
- [ ] A new `PassthroughCartoonService` class implements `CartoonService` and returns a no-op result (signals to skip cartoon conversion)
- [ ] The `createCartoonService()` factory function in `users.ts` returns `PassthroughCartoonService` when `REPLICATE_API_TOKEN` is not set
- [ ] When passthrough is active, the upload endpoint uploads the original buffer as both `original.webp` AND `avatar.webp` (or skips the separate cartoon upload)
- [ ] A warning is logged when running in passthrough mode so operators know cartoon conversion is disabled
- [ ] Profile picture uploads work correctly in dev/test environments without a Replicate token
- [ ] Unit tests verify the fallback behavior

### US-003: Increase Replicate API Timeout

**Description:** Increase the Replicate API polling timeout from 30 seconds to 60 seconds to accommodate model cold starts and variable inference times.

**Acceptance Criteria:**
- [ ] `TIMEOUT_MS` in `replicate-cartoon-service.ts` is increased from `30_000` to `60_000`
- [ ] Timeout error message is updated to reflect the new 60-second limit
- [ ] The existing timeout unit test is updated to expect the new timeout value
- [ ] The frontend/mobile upload timeout (already 60s per the original PRD) is verified to match

## Functional Requirements

- FR-1: Update `CartoonService` interface — `cartoonize` accepts `(imageUrl: string)` and returns `Promise<Buffer>` (the cartoon image buffer)
- FR-2: Update `ReplicateCartoonService` to send the image URL string directly in `input.image` instead of base64-encoding a buffer
- FR-3: Create `PassthroughCartoonService` that implements `CartoonService` and returns `null` (signals skip) or downloads the image from the URL as-is
- FR-4: Update `createCartoonService()` factory to return `PassthroughCartoonService` when `REPLICATE_API_TOKEN` is not set, with a logged warning
- FR-5: Update `POST /users/me/profile-picture` handler to construct the blob URL after uploading original and pass it to `cartoonize()`
- FR-6: When `PassthroughCartoonService` is used, upload the original buffer as both `original.webp` and `avatar.webp`
- FR-7: Increase `TIMEOUT_MS` from 30,000 to 60,000 in `replicate-cartoon-service.ts`
- FR-8: Update `scripts/migrate-cartoon-pictures.ts` to construct blob URLs and pass them to `cartoonize()`
- FR-9: Update all unit tests for the changed interfaces and new fallback behavior
- FR-10: Ensure `npm run lint` and `npm run test` pass with zero errors

## Non-Goals

- Changing the Replicate model or model version (`zf-kbot/photo-to-anime` version `3f91ee38...` is confirmed working)
- Adding user-facing UI changes (the upload flow UX is unchanged)
- Changing the storage layout or blob paths
- Adding new environment variables beyond what already exists
- Modifying infrastructure/Bicep files

## Files to Modify

| File | Change |
|------|--------|
| `services/api/src/services/cartoon-service.ts` | Update interface: `cartoonize(imageUrl: string): Promise<Buffer>` |
| `services/api/src/services/replicate-cartoon-service.ts` | Use URL input, increase timeout to 60s, remove base64 encoding |
| `services/api/src/services/cartoon-service.test.ts` | Update tests for new interface |
| `services/api/src/routes/users.ts` | Pass blob URL to cartoonize, add passthrough factory logic |
| `services/api/src/routes/users-profile-picture.test.ts` | Update mocks for new interface, add passthrough tests |
| `scripts/migrate-cartoon-pictures.ts` | Use blob URLs instead of buffers |

## Technical Considerations

### Updated Upload Flow

```
User selects image
→ Frontend sends to POST /users/me/profile-picture
→ Multer parses file
→ Sharp: rotate, resize 256×256, convert to WebP → optimizedBuffer
→ Upload optimizedBuffer to profile-pictures/{uid}/original.webp
→ Construct blobUrl = getBlobUrl('profile-pictures/{uid}/original.webp')
→ Call CartoonService.cartoonize(blobUrl) → cartoon buffer
→ Upload cartoon buffer to profile-pictures/{uid}/avatar.webp
→ Update Firestore profilePictureUrl → avatar.webp?v={timestamp}
→ Return { profilePictureUrl } to client
```

### Passthrough Mode (No Token)

When `REPLICATE_API_TOKEN` is not set:
```
→ createCartoonService() returns PassthroughCartoonService
→ cartoonize() logs warning and returns null
→ Upload endpoint detects null, uses optimizedBuffer as avatar
→ Both original.webp and avatar.webp contain the same (non-cartoon) image
→ Upload succeeds, user sees their real photo
```

## Success Metrics

- Profile picture uploads succeed in both dev (no token) and prod (with token) environments
- Cartoon conversion completes within 60 seconds for 95%+ of uploads
- All existing tests pass after the refactoring
- Zero regressions in profile picture upload/delete/display functionality
