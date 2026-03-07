# PRD: Fix Profile Picture Upload Hang

## Introduction

The profile picture upload feature hangs indefinitely — the UI shows "✨ Anime-fying your photo…" but never completes. This PRD covers investigating the root cause, fixing the hang, and hardening the feature with proper timeouts and error feedback so it fails gracefully in the future.

**Likely root cause:** Based on codebase analysis, the server-side `POST /users/me/profile-picture` handler calls `admin.storage().bucket()` to save the anime-filtered image to Firebase Storage. If the Firebase Admin SDK credentials are misconfigured or the storage bucket is unreachable, the SDK hangs indefinitely trying Application Default Credentials (ADC) — it neither succeeds nor throws. The client `fetch()` has no timeout, so it also waits forever, leaving the user stuck on the "Anime-fying" spinner.

**Secondary concerns identified during analysis:**
- No request timeout on client or server
- No error boundary around the `sharp` anime filter pipeline
- No server-side request timeout middleware
- Static progress text with no timeout-based fallback messaging

## Goals

- Identify and fix the root cause of the upload hang (Firebase Storage connectivity or credentials)
- Add client-side request timeout so the UI never hangs indefinitely
- Add server-side processing timeout so slow/stuck requests are terminated cleanly
- Improve error feedback so users understand what went wrong and can retry
- Ensure the fix works on both web and mobile clients

## User Stories

### US-001: Diagnose and fix the root cause of the upload hang
**Description:** As a developer, I need to identify why the profile picture upload hangs and fix the underlying issue so uploads complete successfully.

**Acceptance Criteria:**
- [ ] Reproduce the hang locally or against beta by uploading a profile picture
- [ ] Check API logs (`pino` output) for the `/users/me/profile-picture` endpoint — identify where the request stalls (anime filter, `storageFile.save()`, `getSignedUrl()`, or Firestore update)
- [ ] Verify Firebase Storage bucket configuration — confirm `admin.storage().bucket()` has a valid default bucket or explicit bucket name
- [ ] Verify Firebase Admin SDK credentials include `private_key` + `client_email` (required for Storage operations; without them the SDK hangs on ADC)
- [ ] If bucket/credentials are the issue: fix the configuration and verify uploads complete end-to-end
- [ ] If `sharp`/anime-filter is the issue: identify the failing image type and fix the pipeline
- [ ] Upload succeeds and returns `profilePictureUrl` within 10 seconds for a typical photo
- [ ] Typecheck passes

### US-002: Add client-side upload timeout
**Description:** As a user, I want the upload to fail with a clear message if it takes too long, instead of hanging forever on "Anime-fying your photo…".

**Acceptance Criteria:**
- [ ] Add an `AbortController` with a 20-second timeout to the `apiUploadFile` function in `apps/web/src/lib/api.ts`
- [ ] When the timeout fires, abort the fetch and throw a user-friendly error (e.g., "Upload timed out. Please try again.")
- [ ] The account page displays the timeout error in the existing `uploadError` state
- [ ] The `uploading` spinner is cleared when the timeout fires
- [ ] Add equivalent timeout handling in `apps/mobile/src/lib/api.ts` for mobile
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Add server-side processing timeout for anime filter
**Description:** As a developer, I need the anime filter to fail cleanly if `sharp` processing takes too long, so the request doesn't hang the event loop.

**Acceptance Criteria:**
- [ ] Wrap the `animeFilter()` call in the upload route handler with a `Promise.race` against a 15-second timeout
- [ ] If the timeout fires, respond with `500 { error: "Image processing timed out. Please try a smaller image." }`
- [ ] Log the timeout event with `pino` at `error` level including the UID and file size
- [ ] Add a unit test for the timeout behavior (mock `animeFilter` to never resolve)
- [ ] Typecheck passes

### US-004: Add explicit Firebase Storage bucket configuration
**Description:** As a developer, I need the Firebase Storage bucket to be explicitly configured so we get clear errors instead of silent hangs when credentials are wrong.

**Acceptance Criteria:**
- [ ] Update `admin.storage().bucket()` calls in the profile picture routes to use an explicit bucket name from environment variable (`FIREBASE_STORAGE_BUCKET`) with a sensible default
- [ ] At API startup, attempt a lightweight Firebase Storage connectivity check (e.g., `bucket.exists()`); log a warning via `pino` at `warn` level if it fails — do NOT block startup
- [ ] Add `FIREBASE_STORAGE_BUCKET` to the API's environment configuration in Bicep templates (`infra/`) and deployment workflows
- [ ] Document the new env var in the API's README or CLAUDE.md
- [ ] Typecheck passes

### US-005: Improve upload error feedback in the UI
**Description:** As a user, I want clear feedback if my upload fails — not just a generic error — so I know whether to retry, use a different image, or report a bug.

**Acceptance Criteria:**
- [ ] Display specific error messages for: timeout, file too large, invalid type, server error, and network failure
- [ ] After 5 seconds of uploading, change the status text from "✨ Anime-fying your photo…" to "✨ Still working… this can take a moment for large photos"
- [ ] Add a "Cancel" button that appears after 5 seconds, allowing users to abort the upload
- [ ] On error, show a "Retry" button alongside the error message
- [ ] Apply equivalent improvements to the mobile AccountScreen
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: The profile picture upload must complete or fail within 20 seconds from the user's perspective
- FR-2: Client-side `fetch` calls for upload must use `AbortController` with a 20-second timeout
- FR-3: Server-side anime filter processing must be bounded by a 15-second timeout via `Promise.race`
- FR-4: Firebase Storage bucket must be explicitly configured via `FIREBASE_STORAGE_BUCKET` env var
- FR-5: The API must log (pino, error level) any upload failure including: UID, file size, MIME type, and failure reason
- FR-6: The UI must show progressive status messages during upload (immediate → 5s → timeout)
- FR-7: The UI must provide a "Cancel" affordance after 5 seconds and a "Retry" button on failure
- FR-8: All error paths must clear the `uploading` state so the UI never gets permanently stuck
- FR-9: At startup, the API must perform a lightweight Firebase Storage connectivity check and log a warning if it fails (non-blocking)
- FR-10: If the anime filter fails or times out, the upload must fail entirely — no fallback to the original unprocessed image

## Non-Goals

- Not changing the anime filter algorithm or visual style
- Not adding upload progress bars (multipart progress tracking is complex and out of scope)
- Not adding image cropping or preview before upload
- Not migrating away from Firebase Storage
- Not adding retry logic on the server side (client can retry manually)
- Not falling back to original (non-anime) images when the anime filter fails — the anime style is a core part of the feature identity

## Dependencies

None

## Technical Considerations

- **Firebase Admin SDK ADC behavior:** When no service account credentials are provided, `admin.storage().bucket().file().save()` attempts Application Default Credentials which can hang indefinitely in container environments without metadata servers. This is the most likely root cause.
- **Sharp library:** The anime filter runs 5 sequential sharp operations. While typically fast (<1s), corrupt images or unusual color spaces could cause sharp to hang or OOM. The timeout protects against this.
- **Multer memory storage:** Files are buffered entirely in memory (up to 5 MB). The anime filter creates multiple intermediate buffers (~4-5× the input size). For a 5 MB input, peak memory usage could be ~25 MB per concurrent upload. This is fine for current traffic but worth monitoring.
- **Signed URL expiry:** Current URLs expire in 2099. If we switch to short-lived URLs in the future, we'll need a refresh mechanism. Out of scope for this PRD.
- **Mobile `apiUploadFile`:** Uses React Native's `fetch` which supports `AbortController` in recent Expo versions (55+). Verify compatibility.

## Success Metrics

- Profile picture uploads complete successfully within 10 seconds (p95)
- Zero instances of the UI hanging indefinitely on "Anime-fying"
- Upload errors display a clear, actionable message within 20 seconds
- Upload success rate ≥ 95% (excluding user-caused errors like wrong file type)

## Open Questions

All questions resolved:

| Question | Decision |
|----------|----------|
| Add a health check for Firebase Storage at startup? | **Yes, but non-blocking.** Log a warning at `warn` level if Storage is unreachable; don't prevent the API from starting. |
| Fall back to original image if anime filter fails? | **No.** The anime style is a core feature. Fail the upload so the user can retry. |
| Client-side timeout duration? | **20 seconds.** Balanced between UX responsiveness and tolerance for slow connections. |
