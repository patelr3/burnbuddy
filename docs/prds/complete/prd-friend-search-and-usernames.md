# PRD: Fix Friend Search + Add Username Support

## Introduction

BurnBuddy's friend search is broken for web users: signing up via the web app creates a Firebase Auth account but never writes a Firestore user profile, so those users are invisible to friend search. Additionally, the search currently only supports email prefix matching. This PRD covers fixing the profile creation bug and adding username support so users can find each other by username or email.

**Root cause of the bug:** The web app uses FirebaseUI for login/signup. After authentication, users are redirected to `/`, which calls `GET /users/me`. If no profile exists (404), it shows a Getting Started card — but no code path ever creates the Firestore `users` document. The mobile app correctly calls `POST /users` after signup, but the web app doesn't.

## Goals

- Ensure every web user who signs up gets a Firestore profile automatically (fixing the search bug)
- Allow users to search for friends by username or email
- Auto-generate a default username from each user's email prefix (e.g., `16patelr@gmail.com` → `16patelr`)
- Provide a settings page where users can view and change their username
- Enforce username uniqueness across all users

## User Stories

### US-001: Auto-create Firestore profile on web login
**Description:** As a web user, I want my Firestore profile to be created automatically when I sign up so that other users can find me in friend search.

**Acceptance Criteria:**
- [ ] When `onAuthStateChanged` fires with an authenticated user, `PUT /users/me` is called with `{ email, displayName }` from the Firebase Auth user object
- [ ] The call is idempotent — existing profiles are not overwritten, only missing profiles are created
- [ ] Profile creation does not block page rendering (fire-and-forget with error logging)
- [ ] After signing up on the web, the user appears in friend search results when another user searches for their email
- [ ] Typecheck passes (`yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-002: Add username field to shared UserProfile type
**Description:** As a developer, I need the `UserProfile` type to include `username` and `usernameLower` fields so all packages can reference usernames.

**Acceptance Criteria:**
- [ ] `UserProfile` in `packages/shared/src/types.ts` includes `username?: string` and `usernameLower?: string`
- [ ] Shared package builds successfully (`yarn build`)
- [ ] Typecheck passes (`yarn typecheck`)

### US-003: Auto-generate username on profile creation
**Description:** As a new user, I want a default username generated from my email prefix so I have a username immediately without choosing one.

**Acceptance Criteria:**
- [ ] `POST /users` and `PUT /users/me` (create branch) derive username from the email prefix (part before `@`)
- [ ] `usernameLower` is stored as the lowercase version for case-insensitive search
- [ ] Username is reserved in a `usernames` Firestore collection (doc ID = lowercase username, value = `{ uid }`) using a batch write
- [ ] If the email prefix is already taken, a numeric suffix is appended (e.g., `16patelr` → `16patelr2`)
- [ ] Existing API tests still pass (`cd services/api && yarn test`)
- [ ] New tests cover default username generation and collision handling

### US-004: Search by username or email
**Description:** As a user, I want to search for friends by typing a username or email so I can find people either way.

**Acceptance Criteria:**
- [ ] `GET /users/search?q=<query>` runs two parallel Firestore queries: one on `email` prefix and one on `usernameLower` prefix
- [ ] Results are merged and deduplicated by `uid`
- [ ] Response includes `username` field alongside `uid`, `displayName`, `email`
- [ ] Current user is excluded from results
- [ ] Minimum query length of 2 characters is still enforced
- [ ] Limit of 10 results is still enforced (across both queries combined)
- [ ] New tests cover searching by username prefix
- [ ] Existing search tests still pass

### US-005: Update friend search UI for usernames
**Description:** As a user, I want to see usernames in the friend search results so I can identify people by their handle.

**Acceptance Criteria:**
- [ ] Search input placeholder updated to "Search by username or email"
- [ ] Search results show `@username` below or next to the display name
- [ ] Friend list entries show `@username` alongside the display name
- [ ] Typecheck passes (`yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-006: Update username via API
**Description:** As a user, I want to change my username so I can pick a handle I prefer over the auto-generated one.

**Acceptance Criteria:**
- [ ] `PUT /users/me` accepts a `username` field in the request body
- [ ] Username is validated: alphanumeric and underscores only, 3–30 characters
- [ ] Invalid usernames return 400 with a descriptive error message
- [ ] Duplicate usernames return 409 with error "Username already taken"
- [ ] Old username reservation in the `usernames` collection is released, new one is created (atomic batch write)
- [ ] New tests cover username update, validation errors, and uniqueness conflicts
- [ ] Existing tests still pass

### US-007: Settings page with username editing
**Description:** As a user, I want a settings page where I can see my profile info and change my username.

**Acceptance Criteria:**
- [ ] New page at `apps/web/src/app/settings/page.tsx`
- [ ] Page displays current display name, email (read-only), and username (editable)
- [ ] Username field shows real-time validation feedback (format rules, taken/available)
- [ ] Saving username calls `PUT /users/me` and shows success/error feedback
- [ ] NavBar includes a link to `/settings` (gear icon or "Settings" text)
- [ ] Typecheck passes (`yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-008: Lazy username generation for existing users
**Description:** As an existing user who signed up before username support was added, I want a username auto-generated for me so I'm discoverable by username.

**Acceptance Criteria:**
- [ ] When `PUT /users/me` is called for a user whose profile exists but has no `username`, a default username is generated (same email-prefix logic as US-003)
- [ ] The username reservation is created in the `usernames` collection
- [ ] This happens transparently — the user does not need to take action
- [ ] New tests cover the lazy migration path

## Functional Requirements

- FR-1: Web auth context must call `PUT /users/me` with `{ email, displayName }` when a user authenticates, ensuring a Firestore profile exists
- FR-2: `UserProfile` type must include optional `username` and `usernameLower` fields
- FR-3: Profile creation (`POST /users`, `PUT /users/me` create path) must auto-generate a username from the email prefix (part before `@`)
- FR-4: If the derived username is already taken, append incrementing numeric suffixes (`name2`, `name3`, ...) until a unique one is found
- FR-5: Username uniqueness must be enforced via a `usernames` Firestore collection where doc ID = lowercase username and value = `{ uid }`
- FR-6: Profile creation and username reservation must be performed atomically using a Firestore batch write
- FR-7: `GET /users/search?q=<query>` must search both `email` prefix and `usernameLower` prefix in parallel, merge results, and deduplicate by `uid`
- FR-8: Search response must include `username` in the result objects
- FR-9: `PUT /users/me` must accept `username` updates with format validation (alphanumeric + underscores, 3–30 characters)
- FR-10: Username updates must atomically release the old reservation and create the new one
- FR-11: The friend search UI must display `@username` for each result and friend list entry
- FR-12: A `/settings` page must allow viewing profile info and editing username with validation feedback
- FR-13: Existing users without a username must have one generated lazily when their profile is updated via `PUT /users/me`

## Non-Goals (Out of Scope)

- No display name editing (users can already set this via Firebase Auth)
- No avatar/profile picture support
- No username-based deep links or public profile pages
- No mobile app changes for username support (mobile signup already creates profiles correctly; username UI for mobile is a separate effort)
- No batch migration script for existing users — usernames are generated lazily
- No real-time username availability checking (just on-submit validation)
- No email-based uniqueness enforcement beyond what Firebase Auth provides

## Design Considerations

- Reuse existing `NavBar` component and add a settings link
- Follow existing Tailwind v4 + orange-500 brand color patterns from the home page
- Friend search results should show: **DisplayName** with `@username` in smaller/muted text below
- Settings page layout should match the existing card-based design (rounded borders, slate-100 border, shadow-sm)

## Technical Considerations

- **Firestore can't do OR queries across different fields.** Solution: run two parallel queries (one on `email`, one on `usernameLower`) and merge results in application code.
- **Username uniqueness** uses a separate `usernames` collection. Doc ID = lowercase username gives atomic uniqueness via Firestore's document ID constraint. Batch writes ensure atomicity between `users/{uid}` and `usernames/{username}`.
- **Case insensitivity** is handled by storing `usernameLower` on the user document for Firestore range queries. The display version preserves original casing.
- **Web auto-profile creation** uses `PUT /users/me` (upsert) rather than `POST /users` (create-only) to be idempotent across page reloads and re-logins.
- **Existing `PUT /users/me`** already supports upsert, so the lazy username generation for existing users can piggyback on the same endpoint — when updating a profile that lacks a username, generate one automatically.

## Success Metrics

- Both test users (`16patelr@gmail.com`, `arayosunrp@gmail.com`) appear in friend search results after logging in via the web app
- Users can find each other by typing a username prefix (e.g., `16pat` finds `16patelr`)
- All existing API tests continue to pass
- New tests cover username generation, uniqueness, search, and update flows

## Resolved Questions

- **Minimum username length:** 3 characters (max 30). Confirmed.
- **Username change rate limiting:** No rate limiting. Users can change their username freely.
- **Google sign-in displayName:** Use Firebase Auth's `displayName` as-is (e.g., "Rahul Patel" from Google). No special prompt or fallback needed.

## Open Questions

None — all questions resolved.
