# PRD: Friend Profile Actions

## Introduction

When viewing a friend's profile, users currently see a burn buddy relationship status badge but have limited ability to take action. The only interactive element is a "Request Burn Buddy" button when no burn buddy relationship exists. There are no options to remove a friend, remove a burn buddy, cancel a pending request, or respond to an incoming request directly from the profile page.

This feature adds a complete set of relationship management actions to the friend profile page. It also introduces **cascade deletion**: removing a friend who is also a burn buddy will remove both relationships in a single operation. This requires updates to the TLA+ formal specifications, API endpoints, and the web frontend.

## Goals

- Allow users to manage all friend/burn buddy relationships from a single profile page
- Provide clear confirmation dialogs when destructive actions affect multiple relationships
- Ensure cascade behavior (remove friend → also removes burn buddy) is formally specified in TLA+ before implementation
- Add cancel/accept/decline actions for pending burn buddy requests on the profile page
- Maintain all existing safety invariants (no duplicate relationships, friendship prerequisite, etc.)

## User Stories

### US-001: Update TLA+ specs for cascade friend deletion and request cancellation

**Description:** As a developer, I need the formal specifications to model the new cascade deletion behavior and cancel-request action so that correctness is verified before implementation.

**Acceptance Criteria:**
- [ ] `FriendManagement.tla`: `DeleteFriend` action gains a `buddyRequests` and `burnBuddies` variable — when a friendship is deleted, any active burn buddy relationship for that pair is also removed, and any pending buddy requests for that pair are cancelled
- [ ] `BurnBuddyManagement.tla`: `DeleteFriendship` action updated to cascade-delete the burn buddy relationship (not just pending requests — also the active buddy). Add a `CancelBuddyRequest` action allowing the sender to withdraw a pending request
- [ ] `CrossDomainInvariants.tla`: Remove CDI-6 "orphaned burn buddy" discrepancy comment and add a new invariant `CDI-8: No burn buddy relationship without friendship` — `∀ bb ∈ burnBuddies : bb ∈ friends`. Update `DeleteFriendship` to cascade-delete burn buddies
- [ ] All TLA+ specs pass TLC model checking with no invariant violations
- [ ] Run `cd specs/tla && ./run-tlc.sh` (or equivalent) to verify all specs pass

### US-002: Add `friendshipStatus` to profile stats API

**Description:** As a frontend developer, I need the profile stats endpoint to return the friendship status so I can render the correct action buttons.

**Acceptance Criteria:**
- [ ] `GET /users/:uid/profile` response includes `friendshipStatus: 'friends'` (always, since the endpoint already requires friendship to access)
- [ ] The `ProfileStats` type in `packages/shared/src/types.ts` includes `friendshipStatus: 'friends'`
- [ ] Existing tests for the profile endpoint continue to pass
- [ ] Typecheck passes (`cd apps/web && yarn typecheck` and `cd services/api && yarn typecheck`)

### US-003: Add cancel burn buddy request endpoint

**Description:** As a user, I want to cancel a burn buddy request I've sent so I can change my mind before the recipient responds.

**Acceptance Criteria:**
- [ ] New endpoint `DELETE /burn-buddies/requests/:id` cancels a pending request
- [ ] Only the sender (`fromUid`) can cancel their own request
- [ ] Returns 404 if request doesn't exist, 403 if not the sender, 409 if not pending
- [ ] Returns 204 on success
- [ ] Unit tests cover: auth required, not found, wrong user, not pending, success
- [ ] All API tests pass (`cd services/api && yarn test`)

### US-004: Update friend deletion API to cascade-delete burn buddy

**Description:** As a user, when I remove a friend who is also my burn buddy, both relationships should be removed in one operation.

**Acceptance Criteria:**
- [ ] `DELETE /friends/:uid` checks for and deletes any active burn buddy relationship between the two users
- [ ] `DELETE /friends/:uid` also cancels any pending burn buddy requests between the two users
- [ ] The operation is atomic where possible (batch write) or idempotent on retry
- [ ] Existing friend deletion tests still pass
- [ ] New tests cover: friend-only deletion (no buddy), friend+buddy cascade deletion, friend+pending-request cascade deletion
- [ ] All API tests pass (`cd services/api && yarn test`)

### US-005: Add "Remove Friend" button to profile page

**Description:** As a user viewing a friend's profile, I want to remove them as a friend.

**Acceptance Criteria:**
- [ ] "Remove Friend" button appears on all friend profiles (regardless of burn buddy status)
- [ ] When the friend is NOT a burn buddy: clicking shows confirmation "Remove [name] as a friend?"
- [ ] When the friend IS a burn buddy: clicking shows confirmation "Removing [name] as a friend will also end your burn buddy relationship. Are you sure?" listing both consequences
- [ ] On confirmation, calls `DELETE /friends/:uid` and redirects to `/friends` page
- [ ] Button has destructive styling (red/danger color)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Add "Remove Burn Buddy" button to profile page

**Description:** As a user viewing a burn buddy's profile, I want to end the burn buddy relationship while keeping the friendship.

**Acceptance Criteria:**
- [ ] "Remove Burn Buddy" button appears when `buddyRelationshipStatus === 'buddies'`
- [ ] Clicking shows confirmation: "End burn buddy relationship with [name]? You will remain friends."
- [ ] On confirmation, calls `DELETE /burn-buddies/:id` where `:id` is the burn buddy document ID
- [ ] Profile refreshes to show `buddyRelationshipStatus: 'none'` and "Request Burn Buddy" button reappears
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Add accept/decline buttons for incoming burn buddy requests

**Description:** As a user viewing a friend's profile who has sent me a burn buddy request, I want to accept or decline it directly from their profile.

**Acceptance Criteria:**
- [ ] When `buddyRelationshipStatus === 'pending_received'`, show "Accept" and "Decline" buttons instead of just the "Request Received" badge
- [ ] "Accept" calls `POST /burn-buddies/requests/:id/accept` and refreshes profile to show burn buddy status
- [ ] "Decline" calls `POST /burn-buddies/requests/:id/decline` and refreshes profile to show `none` status
- [ ] The pending request ID must be fetched or included in the profile response
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Add cancel button for outgoing burn buddy requests

**Description:** As a user viewing a friend's profile to whom I've sent a burn buddy request, I want to cancel it.

**Acceptance Criteria:**
- [ ] When `buddyRelationshipStatus === 'pending_sent'`, show "Cancel Request" button instead of just the "Request Pending" badge
- [ ] Clicking shows confirmation: "Cancel burn buddy request to [name]?"
- [ ] On confirmation, calls `DELETE /burn-buddies/requests/:id` (the new cancel endpoint from US-003)
- [ ] Profile refreshes to show `buddyRelationshipStatus: 'none'` and "Request Burn Buddy" button reappears
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Include pending request ID in profile stats response

**Description:** As a frontend developer, I need the profile stats to include the burn buddy request ID when there's a pending request, so I can call accept/decline/cancel endpoints.

**Acceptance Criteria:**
- [ ] `GET /users/:uid/profile` includes `pendingBuddyRequestId: string | null` in the response
- [ ] When `buddyRelationshipStatus` is `'pending_sent'` or `'pending_received'`, the corresponding request ID is returned
- [ ] When status is `'none'` or `'buddies'`, `pendingBuddyRequestId` is `null`
- [ ] The `ProfileStats` type in `packages/shared/src/types.ts` is updated accordingly
- [ ] Similarly, include `burnBuddyId: string | null` — the document ID of the active burn buddy relationship (needed for the remove burn buddy action)
- [ ] When `buddyRelationshipStatus` is `'buddies'`, `burnBuddyId` is the document ID; otherwise `null`
- [ ] Existing profile tests updated; all API tests pass

## Functional Requirements

- FR-1: `DELETE /friends/:uid` must cascade-delete any active burn buddy relationship between the two users
- FR-2: `DELETE /friends/:uid` must cancel (delete) any pending burn buddy requests between the two users
- FR-3: New endpoint `DELETE /burn-buddies/requests/:id` allows the sender to cancel a pending burn buddy request
- FR-4: `GET /users/:uid/profile` response must include `friendshipStatus`, `pendingBuddyRequestId`, and `burnBuddyId`
- FR-5: Profile page shows "Remove Friend" button on all friend profiles with appropriate confirmation dialogs
- FR-6: Profile page shows "Remove Burn Buddy" button when users are burn buddies
- FR-7: Profile page shows "Accept" and "Decline" buttons when a burn buddy request has been received
- FR-8: Profile page shows "Cancel Request" button when a burn buddy request has been sent
- FR-9: Confirmation dialog for removing a friend who is also a burn buddy must explicitly mention both relationships will end
- FR-10: TLA+ specifications must be updated and verified BEFORE backend/frontend implementation begins

## Non-Goals

- No changes to the `/friends` list page (actions are on the profile page only)
- No changes to the burn buddies list page or detail page
- No push notifications for request cancellation or relationship removal
- No "block user" functionality
- No undo/restore for removed relationships
- No changes to the friend request flow (sending/accepting/declining friend requests stays on the friends page)
- No mobile app changes (web only)

## Dependencies

None — all prerequisite features (friends, burn buddies, profile page) are already implemented.

## Design Considerations

- **Button layout**: Action buttons should appear below the profile stats section. Destructive actions (Remove Friend, Remove Burn Buddy) should use red/danger styling. Positive actions (Accept, Request Burn Buddy) use primary styling.
- **Confirmation dialogs**: Use the browser's native `confirm()` or a simple modal. The confirmation text must clearly describe the consequences, especially for cascade deletions.
- **Loading states**: Show loading spinners on buttons during API calls. Disable buttons while requests are in flight to prevent double-submission.
- **Reuse existing components**: The profile page already has badge/button rendering for burn buddy status — extend this pattern.

## Technical Considerations

- **TLA+ first**: Updating specs before implementation catches design issues (e.g., race conditions in cascade deletion) before writing code.
- **Firestore batch writes**: The cascade deletion (friend + burn buddy + pending requests) should use a Firestore batch write for atomicity where possible.
- **Cache invalidation**: The `/friends` endpoint has 30-second caching. After removal, the frontend should invalidate/refetch rather than relying on stale cache.
- **Burn buddy document ID**: The frontend needs the burn buddy document ID to call `DELETE /burn-buddies/:id`. This is why US-009 adds `burnBuddyId` to the profile response. The document ID format is `${uid1}_${uid2}` with sorted UIDs.
- **Cross-domain invariant change**: Currently `CrossDomainInvariants.tla` documents that burn buddies persist after friendship deletion as "by design" (CDI-6). This PRD changes that behavior — cascade deletion means CDI-6 becomes a real invariant rather than a documented discrepancy.

## Success Metrics

- All TLA+ specs pass model checking with updated cascade invariants
- Users can manage all relationship states from a single profile page
- Cascade friend deletion correctly removes burn buddy in a single user action
- All existing API tests continue to pass alongside new tests
- No orphaned burn buddy relationships after friend deletion

## Open Questions

- Should we add an API endpoint to cancel a pending **friend** request (not just burn buddy)? Currently out of scope but worth considering for a future PRD.
- Should the profile page show a "Send Friend Request" button for non-friends, or keep friend requests on the `/friends` page only? Out of scope for this PRD.
