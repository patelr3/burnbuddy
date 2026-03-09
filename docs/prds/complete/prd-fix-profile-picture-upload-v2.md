# PRD: Fix Profile Picture Upload Failures

## Introduction

Profile picture uploads are failing for **all image formats** (HEIC and JPG both confirmed). Users see a generic "Upload failed. Please try again." error after the upload spinner. The server returns a 500 or 503 status code, but the web client does not surface the specific server error message — making diagnosis difficult for both users and developers.

Investigation reveals two independent issues:

1. **Firebase Storage failure (affects all formats):** After sharp successfully processes the image, the Firebase Storage `save()` or `getSignedUrl()` call fails — likely due to missing credentials, wrong bucket name, or insufficient permissions in the deployed beta environment. This explains why both JPG and HEIC uploads fail.

2. **HEIC codec missing in sharp/libvips (affects HEIC only):** The sharp library's libvips build in the Alpine Docker image lacks the `libde265` codec needed for HEIC decoding. `sharp.format.heif.input.fileSuffix` only lists `['.avif']`, not `.heic`/`.heif`. Even if Storage is fixed, HEIC uploads would still fail at the image processing step.

3. **Generic client-side error masking:** The `apiUploadFile()` function only reads the response body for 400 and 413 status codes. For 500/503 errors, it throws a generic "Upload failed" message, hiding the server's specific error (e.g., "Image processing failed" vs "Storage service unavailable").

## Goals

- Make profile picture uploads work reliably for JPEG, PNG, WebP, HEIC, and HEIF formats
- Surface specific, actionable error messages to users when uploads fail
- Add a diagnostics endpoint to detect storage/sharp issues before users hit them
- Ensure the fix works in the Alpine Docker container used for beta and production

## User Stories

### US-001: Fix Client Error Message Surfacing

**Description:** As a user, I want to see a specific error message when my upload fails so I know whether to retry, use a different image, or report a bug.

**Acceptance Criteria:**
- [ ] `apiUploadFile()` in `apps/web/src/lib/api.ts` reads the JSON response body for ALL non-OK responses (not just 400/413)
- [ ] For 500 responses, display category-specific messages: "Image processing failed. Please try a different image." vs "Upload service temporarily unavailable. Please try again."
- [ ] For 503 responses, display: "Upload service temporarily unavailable. Please try again."
- [ ] For network/timeout errors, existing messages are preserved ("Upload timed out…" / "Network error…")
- [ ] Typecheck passes

### US-002: Diagnose and Fix Firebase Storage in Beta

**Description:** As a developer, I need to identify and fix why Firebase Storage operations fail in the beta environment so uploads complete end-to-end for all image formats.

**Acceptance Criteria:**
- [ ] Build the Docker image locally (`docker build -f services/api/Dockerfile -t burnbuddy-api-test .`) and verify sharp processes a JPEG buffer successfully inside the Alpine container
- [ ] Test Firebase Storage connectivity in beta — check that `checkStorageConnectivity()` at startup reports the bucket as reachable (check container logs via `az containerapp logs`)
- [ ] Verify the `firebase-storage-bucket` Key Vault secret is set and matches an existing Firebase Storage bucket
- [ ] Verify the `firebase-service-account-json` Key Vault secret contains a valid service account JSON with `private_key` and `client_email` fields
- [ ] Verify the service account has the `Storage Object Admin` role (or equivalent) on the Firebase Storage bucket
- [ ] If `getSignedUrl()` is failing: confirm the service account private key can sign URLs locally (no IAM API needed when using `cert()` credentials)
- [ ] Fix whatever is broken — document the root cause in the PR description
- [ ] A JPG upload through the beta API (`POST /users/me/profile-picture`) returns 200 with a `profilePictureUrl`
- [ ] Typecheck passes

### US-003: Fix HEIC Decoding in Alpine Docker Image

**Description:** As an iPhone user, I want to upload HEIC photos so I don't have to manually convert them to JPEG first.

**Acceptance Criteria:**
- [ ] Determine whether the `node:24-alpine` base image's sharp prebuilt binary includes the `libde265` HEIC codec — run `node -e "console.log(require('sharp').format.heif)"` inside the Docker container
- [ ] If `libde265` is missing: evaluate two approaches:
  - **Option A (preferred):** Attempt to install `libde265` in the Dockerfile runtime stage via `apk add --no-cache libde265` — verify sharp can then decode HEIC buffers
  - **Option B:** If Alpine libde265 doesn't integrate with sharp's bundled libvips, switch the Dockerfile base image to `node:24-slim` (Debian-based) which has better HEIC codec support, OR pre-convert HEIC to JPEG server-side before passing to sharp
- [ ] After the fix: `sharp(heicBuffer).metadata()` succeeds inside the Docker container
- [ ] After the fix: a HEIC upload through the API returns 200 with a valid `profilePictureUrl`
- [ ] Existing JPEG/PNG/WebP uploads still work (no regression)
- [ ] Anime filter was already removed — this only affects the `sharp().rotate().resize().webp().toBuffer()` pipeline
- [ ] Unit tests pass (`cd services/api && yarn test`)
- [ ] Typecheck passes

### US-004: Add Storage and Sharp Diagnostics Endpoint

**Description:** As a developer, I want a diagnostics endpoint that reports the health of storage and image processing so I can detect issues proactively.

**Acceptance Criteria:**
- [ ] Add `GET /diagnostics` route protected by `requireAuth` (only accessible to authenticated users)
- [ ] Response includes:
  - `sharp.version`: the sharp library version
  - `sharp.heifSupport`: whether HEIF/HEIC input is supported (`sharp.format.heif.input.buffer`)
  - `sharp.heifFileSuffixes`: the file suffixes recognized by the HEIF loader
  - `storage.bucketName`: the configured bucket name (from `FIREBASE_STORAGE_BUCKET` env var)
  - `storage.bucketExists`: result of `bucket.exists()` check (boolean)
  - `storage.credentialsPresent`: whether `FIREBASE_SERVICE_ACCOUNT_JSON` env var is set (boolean, does NOT leak the value)
- [ ] Response format: `{ sharp: {...}, storage: {...} }`
- [ ] If any check fails, return partial results with error details — do not crash
- [ ] Add a unit test that verifies the endpoint returns 200 with the expected shape
- [ ] Typecheck passes

### US-005: Verify Uploads Work on Beta

**Description:** As a user, I want to upload profile pictures successfully on the beta environment.

**Acceptance Criteria:**
- [ ] Deploy all fixes to beta via the existing CI/CD pipeline
- [ ] Upload a JPEG photo on the beta web app — photo appears as profile picture
- [ ] Upload a HEIC photo on the beta web app — photo appears as profile picture
- [ ] Upload a PNG photo on the beta web app — photo appears as profile picture
- [ ] Remove profile picture — avatar reverts to initials
- [ ] Verify the diagnostics endpoint returns healthy status on beta
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: The `apiUploadFile()` client function must read the response body for all non-OK status codes and surface the server's error message
- FR-2: The server's error messages for upload failures must be category-specific: "Image processing failed…" (500 from sharp), "Storage service unavailable…" (503 from Firebase Storage)
- FR-3: The API must successfully process and store JPEG, PNG, WebP, HEIC, and HEIF image uploads in the Alpine Docker container
- FR-4: The Dockerfile must include any system dependencies needed for HEIC decoding (e.g., `libde265`)
- FR-5: The `GET /diagnostics` endpoint must report sharp format support, storage bucket status, and credential presence
- FR-6: The diagnostics endpoint must be protected by authentication (`requireAuth` middleware)
- FR-7: All existing profile picture upload tests must continue to pass
- FR-8: The startup `checkStorageConnectivity()` check must correctly detect and log storage issues

## Non-Goals

- Not changing the image processing pipeline (still resize 256×256 → WebP)
- Not adding upload progress bars
- Not adding image cropping or preview before upload
- Not migrating away from Firebase Storage
- Not adding client-side HEIC→JPEG conversion (server handles it)
- Not changing the 5 MB file size limit
- Not modifying the mobile app upload flow (separate concern)

## Dependencies

None — all prerequisite work (HEIC MIME type fallback, anime filter removal, storage connectivity check) is already merged.

## Technical Considerations

- **Sharp HEIC support:** Sharp 0.34.5 bundles libvips with libheif, but the HEIC codec (libde265) may not be included in Alpine prebuilt binaries. The `sharp.format.heif.input.fileSuffix` array is the indicator — if it only shows `['.avif']`, HEIC decode will fail. Installing `libde265` via `apk` may not help if sharp's bundled libvips doesn't dynamically load it. May need to rebuild sharp from source or switch to a Debian base image.
- **Firebase Storage `getSignedUrl()`:** When using `admin.credential.cert(serviceAccount)`, the SDK signs URLs locally using the private key (no IAM API call needed). If using ADC or missing credentials, it falls back to the IAM `signBlob` API which may be disabled in the GCP project.
- **Container resource limits:** The API container has 0.5 CPU and 1Gi memory — sufficient for sharp processing of 5MB images, but worth monitoring.
- **`--ignore-scripts` in Dockerfile:** The builder stage uses `yarn install --frozen-lockfile --ignore-scripts`. Sharp 0.34.x uses optional `@img/sharp-*` packages (not postinstall scripts), so this should be fine. Verify during diagnosis.

## Success Metrics

- JPEG and HEIC uploads succeed on beta with < 5 second processing time
- Users see specific, actionable error messages when uploads fail (not generic "Upload failed")
- Diagnostics endpoint correctly reports storage and sharp health status
- Zero regressions in existing upload test suite

## Open Questions

- Is `libde265` available in Alpine's package repository and compatible with sharp's bundled libvips? If not, what's the best alternative (Debian base image, source build, or client-side conversion)?
- What is the exact Firebase Storage error in beta logs? (Will be answered during US-002 diagnosis)
