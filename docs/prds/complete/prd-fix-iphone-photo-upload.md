# PRD: Fix iPhone Photo Upload & Animify Timeout

## Introduction

iPhone users experience upload failures when uploading profile photos via the web app in Safari. The upload starts ("Anime-fying your photo…") but eventually fails with "Upload failed. Please try again." This is caused by two issues: (1) the anime filter processes images at their original resolution (up to 48MP on modern iPhones) before resizing to 256×256 at the very end, easily exceeding the 15-second server timeout, and (2) iOS HEIC/HEIF photos are not accepted by the upload flow, forcing reliance on inconsistent Safari auto-conversion.

## Goals

- Eliminate upload timeouts for standard iPhone photos (up to 48MP)
- Add native HEIC/HEIF format support across the full upload stack
- Keep the anime filter output quality visually equivalent to current results
- Maintain all existing test coverage and add tests for new behavior

## User Stories

### US-001: Early Downscale in Anime Filter Pipeline

**Description:** As an iPhone user, I want my photo to process quickly so that the upload doesn't time out.

**Acceptance Criteria:**
- [ ] Anime filter resizes input to a max intermediate resolution (e.g., 1024×1024) BEFORE running the posterize/edge-detection pipeline, instead of processing at original resolution
- [ ] Output is still 256×256 WebP (unchanged)
- [ ] Visual quality of anime output is comparable to current results (edge detection and posterization still look good at the intermediate size)
- [ ] Processing a 4032×3024 JPEG completes in under 5 seconds on the API server (well within 15s timeout)
- [ ] Existing anime filter tests still pass
- [ ] Add a test with a large input (e.g., 4032×3024) that verifies it completes in under 10 seconds
- [ ] Typecheck passes

### US-002: Accept HEIC/HEIF on the Server

**Description:** As an iOS user, I want to upload photos in HEIC format so I don't get mysterious "Invalid file type" errors.

**Acceptance Criteria:**
- [ ] `ALLOWED_IMAGE_TYPES` in users.ts includes `image/heic` and `image/heif`
- [ ] Sharp 0.34.5 can decode HEIC input (it bundles libvips with HEIF support) — verify with a unit test
- [ ] Anime filter produces valid 256×256 WebP output from a HEIC input buffer
- [ ] Add a unit test that feeds a minimal HEIC buffer through the anime filter
- [ ] Typecheck passes

### US-003: Accept HEIC/HEIF in Web File Picker

**Description:** As an iPhone user browsing the web app in Safari, I want the file picker to allow me to select HEIC photos directly.

**Acceptance Criteria:**
- [ ] `ACCEPTED_IMAGE_TYPES` constant in account page includes `image/heic,image/heif`
- [ ] File input `accept` attribute updated to include the new types
- [ ] Error message for invalid file types updated to mention HEIC if needed
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Increase Client Upload Timeout

**Description:** As a mobile user on a slower connection, I want a more generous upload timeout so that legitimate uploads don't get cut off.

**Acceptance Criteria:**
- [ ] Client-side timeout in `apiUploadFile` increased from 20 seconds to 45 seconds (the server's anime filter timeout is 15 seconds, plus network transfer time on mobile connections)
- [ ] Timeout error message remains: "Upload timed out. Please try again with a smaller image."
- [ ] Typecheck passes

## Functional Requirements

- FR-1: The anime filter must downscale input images to a maximum of 1024px on the longest side before running the posterize and edge-detection pipeline
- FR-2: The server must accept `image/heic` and `image/heif` MIME types for profile picture uploads
- FR-3: The web file input must include `image/heic` and `image/heif` in its accept filter
- FR-4: The client-side upload timeout must be 45 seconds
- FR-5: The anime filter must continue to produce deterministic 256×256 WebP output
- FR-6: EXIF auto-rotation must still be applied (critical for iPhone photos)
- FR-7: All existing upload and anime filter tests must continue to pass

### US-005: Remove Disruptive Camera Icon Overlay on Avatar

**Description:** As a user, I don't want a white square obscuring my profile picture on the account page. The avatar is already a clickable button with focus ring — no icon overlay is needed.

**Acceptance Criteria:**
- [ ] Remove the camera SVG icon and its `<span>` hover overlay from the avatar button
- [ ] Keep the button clickable (still opens file picker on click)
- [ ] Keep the focus ring styling for accessibility (`focus:ring-2 focus:ring-primary`)
- [ ] Optionally add a subtle `cursor-pointer` visual cue (already present) and/or a slight opacity/scale change on hover instead
- [ ] Typecheck passes
- [ ] Verify visually using dev-browser skill

## Non-Goals

- No changes to the mobile app (Expo) upload flow (separate concern)
- No client-side image resizing before upload (would add complexity; server-side downscale is sufficient)
- No changes to the anime filter's visual style or parameters (blur, saturation, threshold)
- No changes to Firebase Storage structure or signed URL behavior
- No changes to the 5 MB file size limit
- No changes to the delete profile picture flow

## Dependencies

None

## Technical Considerations

- **Sharp 0.34.5 HEIF support:** Sharp's prebuilt binaries (used in the Alpine Docker image) include libvips with HEIF decode support. No additional system packages are needed. Verify this works in the Alpine container.
- **Intermediate resolution choice:** 1024×1024 is a good balance — large enough for quality edge detection, small enough to process in ~1-2 seconds. The final output is only 256×256, so 1024px intermediate is 4× the final size (plenty of detail).
- **Safari HEIC behavior:** Safari's `<input type="file" accept="...">` behavior with HEIC is inconsistent. Sometimes Safari auto-converts to JPEG, sometimes it passes through HEIC. Accepting HEIC server-side eliminates this ambiguity.
- **HEIC test fixture:** Generating a valid minimal HEIC buffer for tests may be tricky. Consider using sharp to create one programmatically (`sharp(...).heif().toBuffer()`) or include a small fixture file.

## Success Metrics

- iPhone users can upload photos without timeout errors
- Upload processing completes in under 5 seconds for typical iPhone photos (12MP)
- HEIC photos are accepted without error
- No regression in anime filter visual quality

## Open Questions

- Should we add a loading progress indicator (e.g., percentage) to the upload UI? (Out of scope for this fix, but could improve UX)
- Should the intermediate resolution be configurable via environment variable?
