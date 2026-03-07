# PRD: Profile Pictures

## Introduction

Add support for user profile pictures across the burnbuddy app. Users can upload, update, and remove a profile picture that appears wherever their identity is shown — buddy lists, workout feeds, profile pages, squads, and account settings. Images are stored in Firebase Storage and **automatically transformed into an anime/cartoon style** using a server-side image processing pipeline built with `sharp` — no external AI APIs or API keys required. A default initials-based avatar is used when no picture is set.

## Goals

- Allow users to upload a profile picture from both web and mobile
- **Automatically convert uploaded photos into an anime/cartoon art style** using a server-side `sharp` pipeline (no external API keys)
- Display anime-styled profile pictures (or initials fallback) everywhere a user appears in the UI
- Resize and stylize uploaded images server-side to a standard dimension for consistent display and fast loading
- Support removing a profile picture (reverting to initials avatar)
- Keep image storage costs low with reasonable file size limits and resizing
- Only the anime-converted version is stored — the original photo is discarded after processing

## User Stories

### US-001: Add profilePictureUrl to UserProfile type and Firestore
**Description:** As a developer, I need the `UserProfile` type and Firestore documents to support a profile picture URL so the field can be read and written across all platforms.

**Acceptance Criteria:**
- [ ] Add `profilePictureUrl?: string` field to `UserProfile` in `packages/shared/src/types.ts`
- [ ] Rebuild shared package (`cd packages/shared && yarn build`)
- [ ] Typecheck passes across all workspaces (`yarn typecheck`)

### US-002: Set up Firebase Storage bucket and security rules
**Description:** As a developer, I need a Firebase Storage bucket configured so profile images can be uploaded and served securely.

**Acceptance Criteria:**
- [ ] Firebase Storage bucket exists and is accessible from the `buddyburn-beta` project
- [ ] Storage security rules allow authenticated users to upload only to their own path (`profile-pictures/{uid}/*`)
- [ ] Storage security rules enforce max file size (5 MB) and allowed content types (`image/jpeg`, `image/png`, `image/webp`)
- [ ] Rules deny reading other users' raw uploads (public access is through the resized URL stored in Firestore)

### US-003: API endpoint to upload profile picture with anime conversion
**Description:** As a user, I want to upload a profile picture through the API so it's converted into an anime-style avatar and stored.

**Acceptance Criteria:**
- [ ] `POST /users/me/profile-picture` accepts a multipart file upload (field name: `picture`)
- [ ] Rejects files over 5 MB with 413 status
- [ ] Rejects non-image content types with 400 status
- [ ] Runs the uploaded image through the anime filter pipeline (see US-003a) to produce an anime-styled output
- [ ] Resizes the anime-styled image to 256×256 pixels (cover/crop)
- [ ] Uploads only the final anime-styled image to Firebase Storage at `profile-pictures/{uid}/avatar.webp`
- [ ] The original photo is **not** stored — it is discarded after processing
- [ ] Generates a public download URL for the anime-styled image
- [ ] Updates the user's Firestore document with `profilePictureUrl` set to the anime image URL
- [ ] Returns `{ profilePictureUrl: string }` with 200 status
- [ ] Unit tests cover success, oversized file, and invalid content type cases
- [ ] Typecheck passes

### US-003a: Anime filter pipeline using sharp
**Description:** As a developer, I need a reusable image processing function that transforms a photo into an anime/cartoon art style using `sharp`, with no external API dependencies.

**Acceptance Criteria:**
- [ ] Create `services/api/src/lib/anime-filter.ts` exporting `animeFilter(inputBuffer: Buffer): Promise<Buffer>`
- [ ] The pipeline applies the following steps in order:
  1. **Posterize colors** — Blur slightly (`sigma: 2`), then boost saturation (`saturation: 1.8`) to create flat, vibrant color regions resembling anime cel shading
  2. **Detect edges** — Convert a copy to greyscale, apply a Sobel convolution kernel, then threshold to produce bold black outlines
  3. **Composite** — Overlay the edge layer onto the posterized layer using `multiply` blend mode so outlines appear on top of flat colors
  4. **Final resize** — Resize the composited result to 256×256 (cover/crop) and output as WebP
- [ ] The function operates entirely on in-memory buffers (no temp files)
- [ ] The function is deterministic — same input always produces same output
- [ ] Unit tests verify the pipeline produces a valid image buffer of correct dimensions
- [ ] Unit tests verify the pipeline handles JPEG, PNG, and WebP inputs
- [ ] Typecheck passes

### US-004: API endpoint to remove profile picture
**Description:** As a user, I want to remove my profile picture so I revert to the default avatar.

**Acceptance Criteria:**
- [ ] `DELETE /users/me/profile-picture` removes the anime-styled image from Firebase Storage (`profile-pictures/{uid}/avatar.webp`)
- [ ] Sets `profilePictureUrl` to `null` (or deletes the field) in the user's Firestore document
- [ ] Returns 204 on success
- [ ] Returns 204 even if no picture existed (idempotent)
- [ ] Unit tests cover both cases
- [ ] Typecheck passes

### US-005: Create reusable Avatar component (web)
**Description:** As a user, I want to see profile pictures (or initials) wherever a user is displayed in the web app.

**Acceptance Criteria:**
- [ ] `Avatar` component at `apps/web/src/components/Avatar.tsx`
- [ ] Props: `displayName: string`, `profilePictureUrl?: string | null`, `size?: 'sm' | 'md' | 'lg'`
- [ ] When `profilePictureUrl` is set, renders a circular `<img>` with the URL
- [ ] When `profilePictureUrl` is absent, renders a circular div with the user's initials (first letter of first + last name, or first two letters of display name)
- [ ] Initials avatar uses a deterministic background color based on the user's name
- [ ] Handles image load errors gracefully by falling back to initials
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Add Avatar to all user-facing surfaces (web)
**Description:** As a user, I want to see profile pictures everywhere users appear — buddy lists, workout feeds, profile pages, squad member lists, and search results.

**Acceptance Criteria:**
- [ ] Avatar shown on the profile page (`apps/web/src/app/profile/[uid]/page.tsx`)
- [ ] Avatar shown on the account page (`apps/web/src/app/account/page.tsx`)
- [ ] Avatar shown in buddy/friend list items
- [ ] Avatar shown in workout feed entries (next to workout author)
- [ ] Avatar shown in squad member lists
- [ ] Avatar shown in user search results
- [ ] All surfaces pass `profilePictureUrl` from the user data to the Avatar component
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Profile picture upload UI (web)
**Description:** As a user, I want to upload or change my profile picture from my account page.

**Acceptance Criteria:**
- [ ] Account page shows current Avatar (large size) with an "Edit" or camera icon overlay
- [ ] Clicking triggers a file picker filtered to image types (`image/jpeg`, `image/png`, `image/webp`)
- [ ] Shows a fun "✨ Anime-fying..." animation/state while the image is being uploaded and processed
- [ ] On success, updates the displayed avatar immediately without page reload
- [ ] On error (file too large, wrong type, network), shows a user-friendly error message
- [ ] "Remove photo" option visible when a profile picture is set
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Create reusable Avatar component (mobile)
**Description:** As a mobile user, I want to see profile pictures wherever users are displayed in the app.

**Acceptance Criteria:**
- [ ] `Avatar` component at `apps/mobile/src/components/Avatar.tsx`
- [ ] Same props interface as web: `displayName`, `profilePictureUrl`, `size`
- [ ] Renders circular `<Image>` from React Native when URL is present
- [ ] Renders initials fallback with deterministic background color when URL is absent
- [ ] Handles image load errors gracefully by falling back to initials
- [ ] Typecheck passes

### US-009: Profile picture upload UI (mobile)
**Description:** As a mobile user, I want to upload or change my profile picture from my account screen.

**Acceptance Criteria:**
- [ ] Account screen shows current Avatar with an edit/camera overlay
- [ ] Tapping triggers image picker (camera roll / take photo) using `expo-image-picker`
- [ ] Shows a fun "✨ Anime-fying..." loading state during upload and processing
- [ ] On success, updates avatar immediately
- [ ] On error, shows an alert with a user-friendly message
- [ ] "Remove photo" option available when a picture is set
- [ ] Typecheck passes

### US-010: Add Avatar to all user-facing surfaces (mobile)
**Description:** As a mobile user, I want to see profile pictures everywhere users appear in the app.

**Acceptance Criteria:**
- [ ] Avatar shown on account screen
- [ ] Avatar shown in buddy/friend lists
- [ ] Avatar shown in workout feed entries
- [ ] Avatar shown in squad member lists
- [ ] All surfaces pass `profilePictureUrl` from user data to Avatar component
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Add `profilePictureUrl?: string` to the `UserProfile` shared type
- FR-2: Configure Firebase Storage bucket with security rules scoped to `profile-pictures/{uid}/*`
- FR-3: `POST /users/me/profile-picture` accepts multipart upload, validates size (≤5 MB) and type (JPEG, PNG, WebP), applies the anime filter pipeline, resizes to 256×256, stores in Firebase Storage, and updates Firestore
- FR-3a: The anime filter pipeline runs entirely server-side using `sharp` — posterize (blur + saturation boost), edge detection (greyscale + Sobel convolution + threshold), composite (multiply blend), and final resize/crop to 256×256 WebP
- FR-3b: Only the anime-converted image is stored. The original upload is discarded after processing.
- FR-4: `DELETE /users/me/profile-picture` removes the anime image from Storage and clears the Firestore field
- FR-5: Expose `profilePictureUrl` in all API responses that include user data (`GET /users/me`, `GET /users/:uid`, `GET /users/:uid/profile`, `GET /users/search`, buddy lists, squad members, workout feeds)
- FR-6: Web and mobile apps display a circular Avatar component (image or initials fallback) everywhere a user is shown
- FR-7: Web and mobile account pages provide upload, replace, and remove functionality for profile pictures
- FR-8: Image upload uses `multer` (or equivalent) middleware on the API with a 5 MB memory limit
- FR-9: Image processing uses `sharp` on the API server — no external AI APIs or API keys required
- FR-10: Web and mobile upload UIs show a fun "✨ Anime-fying..." animation while the image is being processed

## Non-Goals

- No image cropping/editing UI in the client — server handles resize/crop and anime conversion
- No multiple avatar sizes (only 256×256 for now; thumbnail sizes can be added later)
- No social login avatar import (e.g., pulling Google/Facebook profile pictures)
- No animated GIF or video avatar support
- No admin moderation or content review of profile pictures
- No CDN caching layer — Firebase Storage download URLs are sufficient for now
- No AI-based style transfer (e.g., OpenAI, Stability AI) — the anime effect uses deterministic image processing only
- No option to keep the original photo — only the anime-converted version is stored
- No user-adjustable filter intensity or style options (single preset for now)

## Dependencies

None

## Design Considerations

- The Avatar component should be easy to drop in wherever a user's name is currently shown
- Initials colors should be deterministic (same user always gets same color) — use a hash of the display name mapped to a palette of 8–10 background colors
- The upload UI should feel lightweight — no full-page modal, just a file picker triggered from the avatar itself
- The "✨ Anime-fying..." loading animation should be playful and on-brand — consider a shimmer effect or pulsing avatar outline
- Loading states during upload should be clear but non-blocking (user can still scroll the page)

## Technical Considerations

- **Firebase Storage**: The `firebase-admin` SDK in the API already has access to the Firebase project. Storage operations use `admin.storage().bucket()`. Ensure the default bucket is provisioned.
- **Anime filter pipeline**: Uses `sharp` exclusively — no external APIs, no API keys, no network calls during processing. The pipeline is: (1) posterize via blur + saturation boost, (2) edge detection via greyscale + Sobel convolution + threshold, (3) composite edges onto posterized image with multiply blend, (4) resize to 256×256 and output as WebP. All operations are in-memory buffer transforms.
- **sharp convolution**: `sharp` supports custom convolution kernels via `.convolve()`. A 3×3 Sobel kernel (`[-1,0,1,-2,0,2,-1,0,1]`) produces horizontal edge detection. Threshold at ~70 to produce clean black lines.
- **File upload middleware**: Use `multer` with `memoryStorage` for handling multipart uploads. Set a 5 MB limit at the middleware level.
- **Public URLs**: Use Firebase Storage's `getDownloadURL()` or generate signed URLs with long expiry. The URL is stored in Firestore so clients never need direct Storage access.
- **Existing API responses**: Audit all endpoints that return user data to ensure `profilePictureUrl` is included. Since the field is on the Firestore document and the type is shared, most endpoints should pick it up automatically.
- **Mobile image picker**: Use `expo-image-picker` which is part of the Expo ecosystem and supports both camera and gallery.
- **Processing time**: The anime filter pipeline with `sharp` should complete in under 500ms for a typical 5 MB photo. No async job queue is needed — synchronous processing in the request handler is acceptable.

## Success Metrics

- Users can upload a profile picture in under 3 taps/clicks
- Profile pictures load within 1 second on typical connections
- Avatar component renders consistently across all user-facing surfaces
- No increase in page load time for users without profile pictures (initials avatar is pure CSS/view)

## Open Questions

- Should the Firebase Storage bucket be the default bucket for the project, or a dedicated bucket?
- Do we need to handle HEIF/HEIC images from iOS devices (convert to JPEG before resizing)?
- Should profile picture URLs be cached on the client to avoid re-fetching from Firestore on every render?
- Should we expose a "preview" of the anime conversion before confirming the upload, or just apply it immediately?
- Should the anime filter parameters (blur sigma, saturation multiplier, edge threshold) be tunable via environment variables so we can iterate on the look without redeploying code?
