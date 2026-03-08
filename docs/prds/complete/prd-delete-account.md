# PRD: Delete Account

## Introduction

Allow users to permanently delete their BurnBuddy account and all associated data. This addresses user autonomy and data privacy expectations — users should be able to leave the platform cleanly with no orphaned data left behind.

Deletion is a hard delete: all Firestore documents, Firebase Auth records, and Storage files belonging to the user are removed immediately. A two-step confirmation flow (dialog + re-authentication) protects against accidental deletion. If the user is an admin of any BurnSquad, they must transfer admin rights or delete the squad before proceeding.

## Goals

- Allow any user to permanently delete their account and all associated data
- Prevent accidental deletion via two-step confirmation (dialog + re-authentication)
- Ensure no orphaned data remains after deletion (no dangling username reservations, no phantom squad members, no ghost friend entries)
- Block deletion when the user is a squad admin to preserve squad integrity
- Model core deletion invariants in TLA+ before implementing

## User Stories

### US-001: TLA+ — Model account deletion invariants
**Description:** As a developer, I need formal verification that account deletion leaves no orphaned state so that I can implement the feature with confidence.

**Acceptance Criteria:**
- [ ] Add `DeleteProfile(uid)` action to `specs/tla/users/UserProfileManagement.tla`
- [ ] The action removes the UID from `createdProfiles`, frees the username reservation in `usernameOwner`, and resets `hasPicture`
- [ ] Guard: profile must exist (`ProfileExists(uid)`)
- [ ] Existing invariants still pass after adding the delete action: `NoOrphanedReservations`, `UsernameUniqueness`, `UsernameChangeAtomic`, `NoProfileWithoutReservation`, `ReservationsMatchProfiles`
- [ ] Add new invariant `NoOrphanedAuthUsers`: a deleted profile (uid not in `createdProfiles`) must not own any username reservation
- [ ] Add new invariant `DeletionIsComplete`: if a UID is not in `createdProfiles`, its username reservation must be "free"
- [ ] TLC model checker passes with all invariants (run `java -cp ../tla2tools.jar tlc2.TLC UserProfileManagement.tla -config UserProfileManagement.cfg -workers auto`)
- [ ] Typecheck the TLA+ spec with SANY (happens automatically via TLC)

### US-002: API — Delete account endpoint
**Description:** As a user, I want to call `DELETE /users/me` so that my account and all my data are permanently removed.

**Acceptance Criteria:**
- [ ] New `DELETE /users/me` endpoint in `services/api/src/routes/users.ts`
- [ ] Requires authentication (`requireAuth` middleware)
- [ ] Returns `409 Conflict` with message if user is admin of any BurnSquad (include squad names in response body)
- [ ] Deletes all Firestore documents associated with the user:
  - `users/{uid}` (profile document)
  - `usernames/{usernameLower}` (username reservation)
  - All `workouts` where `uid` matches
  - All `friends` documents where the user is either UID in the composite key
  - All `friendRequests` where `fromUid` or `toUid` matches
  - All `burnBuddies` where `uid1` or `uid2` matches
  - All `burnBuddyRequests` where `fromUid` or `toUid` matches
  - All `burnSquadJoinRequests` where `uid` matches
  - Remove the user's UID from `memberUids` arrays in any `burnSquads` they belong to (but are not admin of)
  - All `groupWorkouts` where `memberUids` contains the user (or remove the user from the array if other members remain)
- [ ] Deletes the profile picture from Firebase Storage at `profile-pictures/{uid}/avatar.webp` (ignore 404)
- [ ] Deletes the Firebase Auth user record via `admin.auth().deleteUser(uid)` as the final step
- [ ] Returns `200 OK` with `{ deleted: true }` on success
- [ ] All cleanup is best-effort per collection (log errors but don't fail the whole request if e.g. a workout doc fails to delete)
- [ ] Unit tests following the existing `vi.mock` + `vi.hoisted` + `supertest` pattern covering:
  - Successful deletion (all mocks called)
  - 409 when user is squad admin
  - 401 when not authenticated
- [ ] `cd services/api && yarn test` passes
- [ ] `yarn typecheck` passes (web + API + shared)

### US-003: Web — Delete account UI on account page
**Description:** As a user, I want a "Delete Account" button on my account page so that I can initiate account deletion from the web app.

**Acceptance Criteria:**
- [ ] "Delete Account" button (red/destructive styling) at the bottom of `apps/web/src/app/(main)/account/page.tsx`
- [ ] Clicking the button opens a confirmation dialog: "This will permanently delete your account, all workouts, friendships, and burn buddy relationships. This action cannot be undone."
- [ ] Dialog has "Cancel" and "Delete My Account" buttons
- [ ] Clicking "Delete My Account" triggers a Firebase re-authentication flow (prompts for password or triggers re-auth for Google/social providers)
- [ ] After successful re-authentication, calls `DELETE /users/me` via the existing `apiDelete` helper
- [ ] If the API returns 409 (squad admin), show an error message listing the squads the user must leave/transfer first
- [ ] On success, sign out the user (clear Firebase Auth + auth cookie) and redirect to `/login` with a toast or banner: "Your account has been deleted"
- [ ] Show a loading spinner during the deletion API call (button disabled)
- [ ] `yarn typecheck` passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- **FR-1:** `DELETE /users/me` endpoint requires a valid Firebase Auth token (`requireAuth` middleware)
- **FR-2:** The endpoint must check if the user is admin of any BurnSquad; if so, return `409 Conflict` with the list of squad names
- **FR-3:** Firestore deletion must cover all 9 collections: `users`, `usernames`, `workouts`, `friends`, `friendRequests`, `burnBuddies`, `burnBuddyRequests`, `burnSquadJoinRequests`, `burnSquads` (membership removal only)
- **FR-4:** `groupWorkouts` cleanup: if the user is in `memberUids`, remove them; if only 1 member would remain, delete the group workout document entirely
- **FR-5:** Firebase Storage cleanup: delete `profile-pictures/{uid}/avatar.webp` (idempotent — ignore 404)
- **FR-6:** Firebase Auth record deletion (`admin.auth().deleteUser(uid)`) must happen last, since the token is needed to authorize the request
- **FR-7:** The web UI must show a two-step confirmation: first a dialog, then a re-authentication challenge
- **FR-8:** The web UI must handle the 409 (squad admin) case gracefully with a user-friendly error message
- **FR-9:** After successful deletion, the web app must clear all local auth state and redirect to `/login`

## Non-Goals

- No soft delete / grace period / undo functionality
- No email notification before or after deletion
- No data export (GDPR "right to portability") — this is a separate feature
- No admin-initiated deletion (only self-service)
- No mobile (Expo) implementation in this PRD — mobile delete account will be a follow-up

## Dependencies

None

## Technical Considerations

- **Firestore batch limits:** Firestore batches are limited to 500 operations. For users with many workouts, the cleanup may need to paginate deletes in batches of 500. Use `db.getAll()` or query-then-batch-delete loops.
- **Firebase Auth re-authentication:** The web client uses `reauthenticateWithCredential()` (for email/password) or `reauthenticateWithPopup()` (for Google). Check `auth.currentUser.providerData` to determine which flow to use.
- **Race conditions:** The TLA+ spec should model concurrent deletion + profile updates (e.g., another user trying to send a friend request to a user being deleted). The API should handle "document not found" gracefully during cleanup.
- **Existing patterns:** Follow the `getDb()` pattern for Firestore access, `getStorageBucket()` for Storage, and `admin.auth()` for Auth operations. Tests follow the `vi.hoisted` + `vi.mock` + `supertest` pattern.
- **CORS:** The existing CORS configuration already supports `DELETE` method — no changes needed.

## Success Metrics

- User can delete their account in under 30 seconds (from clicking "Delete Account" to seeing the login page)
- Zero orphaned documents remain after deletion (verified by TLA+ invariants and unit tests)
- No errors in API logs during normal deletion flow

## Open Questions

- Should we add rate limiting to the delete endpoint to prevent abuse? (Probably unnecessary since it requires re-authentication)
- Should we log/audit account deletions for operational visibility? (Out of scope for this PRD, but worth considering)
