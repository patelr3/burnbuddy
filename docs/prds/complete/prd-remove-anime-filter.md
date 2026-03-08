# PRD: Remove Anime Filter from Profile Pictures

## Introduction

The anime-fy feature converts uploaded profile pictures into a cartoon/anime art style using a server-side `sharp` image processing pipeline. This processing is unreliable in production — users on both web and mobile consistently get "Network error" when uploading. Rather than invest more effort debugging the complex multi-step image pipeline, we will remove the anime filter entirely and store profile pictures as simple resized/optimized images.

## Goals

- Remove the anime filter processing pipeline from the upload flow
- Replace it with a simple resize (256×256) + WebP conversion so uploads are fast and reliable
- Remove all anime-related UI copy ("✨ Anime-fying your photo…") from web and mobile
- Remove the `anime-filter.ts` library and its tests
- Remove the `ANIME_FILTER_TIMEOUT_MS` environment variable and timeout logic
- Keep all existing profile picture functionality intact (upload, delete, Avatar display)

## User Stories

### US-001: Replace anime filter with simple image optimization on API

**Description:** As a user, I want my uploaded profile picture to be stored as a resized, optimized image so that uploads are fast and reliable.

**Acceptance Criteria:**

- [ ] Remove the `animeFilter()` call from `POST /users/me/profile-picture` in `services/api/src/routes/users.ts`
- [ ] Replace it with a simple `sharp` pipeline: auto-rotate, resize to 256×256 (cover/crop), output as WebP
- [ ] Remove the `Promise.race` timeout wrapper and `ANIME_FILTER_TIMEOUT_MS` env var logic
- [ ] Remove the `import { animeFilter }` from users.ts
- [ ] Update the route's JSDoc comment to remove anime references
- [ ] Typecheck passes (`cd services/api && npx tsc --noEmit`)

### US-002: Delete anime filter library and tests

**Description:** As a developer, I want dead code removed so the codebase stays clean.

**Acceptance Criteria:**

- [ ] Delete `services/api/src/lib/anime-filter.ts`
- [ ] Delete `services/api/src/lib/anime-filter.test.ts`
- [ ] All remaining API tests pass (`cd services/api && yarn test`)

### US-003: Update profile picture upload tests

**Description:** As a developer, I want the upload tests to reflect the new simpler processing so they remain accurate.

**Acceptance Criteria:**

- [ ] Update `services/api/src/routes/users-profile-picture.test.ts` to remove anime filter mocking/assertions
- [ ] Remove any references to `anime-filter`, `animeFilter`, or `ANIME_FILTER_TIMEOUT_MS` in test code
- [ ] Remove the anime filter timeout test case (if one exists)
- [ ] Tests still verify: file validation, size limits, storage upload, signed URL generation, Firestore update
- [ ] All upload tests pass

### US-004: Update web UI copy

**Description:** As a user, I want the upload status text to say something accurate (not "Anime-fying") so the UI makes sense.

**Acceptance Criteria:**

- [ ] Change "✨ Anime-fying your photo…" to "Uploading photo…" in `apps/web/src/app/(main)/account/page.tsx`
- [ ] Remove the bouncing ✨ spinner and replace with a simple loading indicator or keep the existing Avatar spinner
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-005: Update mobile UI copy

**Description:** As a user on mobile, I want the upload status text to be accurate.

**Acceptance Criteria:**

- [ ] Change "✨ Anime-fying..." to "Uploading…" in `apps/mobile/src/screens/AccountScreen.tsx`
- [ ] Remove any extended anime-related status messages (e.g., "Still working…" messaging tied to anime processing time)
- [ ] Typecheck passes

### US-006: Clean up infrastructure references

**Description:** As a developer, I want environment config cleaned up so there are no references to the removed feature.

**Acceptance Criteria:**

- [ ] Remove `ANIME_FILTER_TIMEOUT_MS` from any Bicep templates, docker-compose files, or documentation that reference it
- [ ] Verify the `sharp` dependency is retained in `services/api/package.json` (still needed for resize/WebP conversion)

## Functional Requirements

- FR-1: `POST /users/me/profile-picture` must accept the same image types (JPEG, PNG, WebP, HEIC, HEIF) and size limit (5 MB) as before
- FR-2: Uploaded images must be auto-rotated (EXIF), resized to 256×256 (cover/crop), and converted to WebP
- FR-3: The processing must complete in well under 1 second for any valid input (no complex filter pipeline)
- FR-4: `DELETE /users/me/profile-picture` behavior is unchanged
- FR-5: Avatar components on web and mobile are unchanged (they just display a URL)
- FR-6: Existing profile pictures in Firebase Storage remain accessible — no migration needed

## Non-Goals

- No migration of existing anime-fied profile pictures (they stay as-is until users re-upload)
- No changes to the Avatar display components
- No changes to the delete endpoint
- No changes to Firebase Storage path structure (`profile-pictures/{uid}/avatar.webp`)
- No removal of the `sharp` dependency (still used for resize/WebP)

## Dependencies

None

## Technical Considerations

- The `sharp` library is already installed and used — we simply replace the complex anime pipeline with a one-liner: `sharp(buffer).rotate().resize(256, 256, { fit: 'cover' }).webp().toBuffer()`
- The `ANIME_FILTER_TIMEOUT_MS` timeout/`Promise.race` wrapper becomes unnecessary since simple resize completes in milliseconds
- Mobile client timeout (20s) and web client timeout (45s) remain unchanged but will no longer be a concern since processing is near-instant
- The `sharp` `--ignore-scripts` issue in the Dockerfile is less risky for simple operations but should still work with the prebuilt `@img/sharp-linuxmusl-x64` package

## Success Metrics

- Profile picture uploads succeed consistently on both web and mobile in production
- Upload latency drops from 10-20+ seconds to under 2 seconds
- Zero "Network error" reports related to profile picture uploads

## Open Questions

- Should we reduce the mobile client upload timeout from 20s to something shorter (e.g., 10s) now that processing is fast? (Probably not worth changing — shorter timeout is fine as-is)
