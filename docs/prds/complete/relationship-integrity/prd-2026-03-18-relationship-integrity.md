# PRD: Relationship Integrity — Fix Drift & Add Validation

## Introduction

A production bug was observed where user `16patelr@gmail.com` saw `venyatham` as an active burn buddy (no pending invite visible), while `venyatham` still saw a pending burn buddy request. The two users had completely inconsistent views of their relationship.

**Root cause**: The burn buddy request system has a cross-directional race condition. When User A sends a request to User B, the duplicate check only looks for pending requests where `fromUid=A, toUid=B` — it does not check the reverse direction (`fromUid=B, toUid=A`). If both users send requests to each other:

1. User A sends request R1 (from=A, to=B, status=pending)
2. User B sends request R2 (from=B, to=A, status=pending) — passes the duplicate check because it only looks at from=B→to=A
3. User B accepts R1 → R1 becomes accepted, `burnBuddies` document created
4. R2 remains pending — User A still sees an incoming pending request

Additionally, the accept handler performs two non-atomic Firestore writes (update request status + create burnBuddy doc), so partial failures can also cause drift. The **friends** system has the identical cross-directional duplicate bug.

This PRD fixes the root causes in both the friends and burn buddy request flows, adds atomic writes, creates a one-time cleanup migration for existing bad data, and adds a diagnostics endpoint for ongoing monitoring.

## Goals

- Eliminate the cross-directional race condition in both friend request and burn buddy request creation
- Make accept handlers use atomic Firestore batched writes so partial failures cannot cause drift
- Clean up existing inconsistent data in production via a one-time migration script
- Add a relationship integrity diagnostics endpoint for ongoing monitoring
- Ensure the TLA+ spec is updated to model the fix (cleanup of reverse pending requests on accept)

## User Stories

### US-001: Fix Cross-Directional Duplicate Check in Burn Buddy Requests
**Description:** As a user, I want the system to prevent duplicate burn buddy requests in both directions so that accepting one request doesn't leave an orphan pending request for the other user.

**Acceptance Criteria:**
- [ ] When creating a burn buddy request from A→B, the handler also checks for an existing pending request from B→A
- [ ] If a reverse pending request exists, the system auto-accepts it instead of creating a new one (since both users want to be burn buddies)
- [ ] The existing burn buddy request creation test file is updated to cover cross-directional scenarios
- [ ] Typecheck passes

### US-002: Fix Cross-Directional Duplicate Check in Friend Requests
**Description:** As a user, I want the system to prevent duplicate friend requests in both directions so that the same race condition cannot occur for friendships.

**Acceptance Criteria:**
- [ ] When creating a friend request from A→B, the handler also checks for an existing pending request from B→A
- [ ] If a reverse pending request exists, the system auto-accepts it instead of creating a new one (since both users want to be friends)
- [ ] The existing friend request creation test file is updated to cover cross-directional scenarios
- [ ] Typecheck passes

### US-003: Atomic Writes in Burn Buddy Accept Handler
**Description:** As a developer, I need the burn buddy accept handler to use Firestore batched writes so that request status update and burnBuddy document creation happen atomically.

**Acceptance Criteria:**
- [ ] `POST /burn-buddies/requests/:id/accept` uses a Firestore `batch` (or transaction) to atomically: (1) update the request status to 'accepted', (2) create the burnBuddy document, (3) delete any other pending requests between the same pair
- [ ] If the batch fails, no partial state is written
- [ ] Existing accept tests still pass
- [ ] Add a test verifying that reverse pending requests are cleaned up on accept
- [ ] Typecheck passes

### US-004: Atomic Writes in Friend Request Accept Handler
**Description:** As a developer, I need the friend request accept handler to use Firestore batched writes so that request status update and friend document creation happen atomically.

**Acceptance Criteria:**
- [ ] `POST /friends/requests/:id/accept` uses a Firestore `batch` (or transaction) to atomically: (1) update the request status to 'accepted', (2) create the friend document, (3) delete any other pending requests between the same pair
- [ ] If the batch fails, no partial state is written
- [ ] Existing accept tests still pass
- [ ] Add a test verifying that reverse pending requests are cleaned up on accept
- [ ] Typecheck passes

### US-005: One-Time Relationship Cleanup Migration Script
**Description:** As an operator, I need a script that scans the production Firestore database, detects inconsistent relationship states, and auto-repairs them with logging.

**Acceptance Criteria:**
- [ ] Script is located at `scripts/repair-relationships.ts` and can be run via `npx tsx scripts/repair-relationships.ts`
- [ ] Script detects and repairs: (a) orphan pending burnBuddyRequests where a burnBuddy already exists for the pair, (b) orphan pending friendRequests where a friend document already exists for the pair, (c) burnBuddy documents that exist without a corresponding friend document, (d) pending requests where one or both UIDs don't have a user profile
- [ ] For each repair action, the script logs what it found and what it did (e.g., "Deleted orphan pending burnBuddyRequest {id} between {uid1} and {uid2} — burnBuddy already exists")
- [ ] Script runs in dry-run mode by default (`--dry-run`), with `--fix` flag to actually apply changes
- [ ] Script uses Firestore batched writes for repairs (max 500 ops per batch per Firestore limits)
- [ ] Add a unit test that validates the detection logic against mock data
- [ ] Typecheck passes

### US-006: Relationship Integrity Diagnostics Endpoint
**Description:** As an operator, I want a diagnostics endpoint that reports the health of relationship data so I can monitor for drift without running a full migration script.

**Acceptance Criteria:**
- [ ] `GET /diagnostics/relationships` (behind `requireAuth`) returns a JSON report with counts of: orphan pending burn buddy requests, orphan pending friend requests, burn buddies without friendships, and total relationships scanned
- [ ] Each issue category includes an array of affected document IDs (capped at 50 per category to avoid huge responses)
- [ ] Endpoint returns within a reasonable time (handles large datasets by using efficient Firestore queries)
- [ ] Add tests for the diagnostics endpoint using the existing mock pattern
- [ ] Typecheck passes

### US-007: Update TLA+ Spec — Prove the Bug, Then Fix It
**Description:** As a developer, I want the TLA+ burn buddy spec to first demonstrate that TLC catches the bug with a new invariant, and then update the actions so the model matches the fixed implementation.

The existing TLA+ spec faithfully models the buggy code but is missing a critical invariant. Specifically:
- **INV-4** (`AtMostOnePendingPerDirection`) only checks same-direction duplicates — it passes even when A→B and B→A both exist as pending
- **`SendBuddyRequest`** guard (line 168-169) only blocks same-direction pending requests, not reverse
- **`AcceptBuddyRequest`** (line 185-186) doesn't clean up a reverse pending request when accepting
- **Line 232-234** comments explicitly acknowledge cross-directional pending requests "can coexist" — treating the bug as expected behavior

**Acceptance Criteria (Phase 1 — Prove the bug):**
- [ ] Add invariant `NoPendingAfterBuddyEstablished`: if a burnBuddy exists for {A,B}, no pending request exists between A and B in either direction. Formally: `\A bb \in burnBuddies : ~\E r \in buddyRequests : r.status = "pending" /\ {r.fromUid, r.toUid} = bb`
- [ ] Run TLC with this new invariant against the **unchanged** actions — TLC must produce a counterexample trace showing the bug (SendBuddyRequest(A,B), SendBuddyRequest(B,A), AcceptBuddyRequest(A,B) → orphan pending B→A)
- [ ] Save or document the counterexample trace as proof the spec catches the bug

**Acceptance Criteria (Phase 2 — Fix the spec):**
- [ ] Update `SendBuddyRequest` to also guard against reverse pending requests: add `~\E r \in buddyRequests : r.fromUid = to /\ r.toUid = from /\ r.status = "pending"` — OR — model the auto-accept behavior (if reverse pending exists, accept it instead of creating a new request)
- [ ] Update `AcceptBuddyRequest` to also remove any reverse pending request (from=to, to=from, status=pending) from `buddyRequests` when accepting
- [ ] Update or remove the comment at line 232-234 that says cross-directional pending requests "can coexist" — this is no longer true
- [ ] TLC model check passes with all invariants including `NoPendingAfterBuddyEstablished`
- [ ] Comments reference the corresponding code changes in burn-buddies.ts and friends.ts

## Functional Requirements

- FR-1: `POST /burn-buddies/requests` must check for pending requests in **both** directions (fromUid→toUid AND toUid→fromUid) before creating a new request
- FR-2: If a reverse pending burn buddy request exists when creating a new one, auto-accept the reverse request (both users want it) and create the burnBuddy document atomically
- FR-3: `POST /friends/requests` must check for pending requests in **both** directions before creating a new request
- FR-4: If a reverse pending friend request exists when creating a new one, auto-accept the reverse request and create the friend document atomically
- FR-5: `POST /burn-buddies/requests/:id/accept` must use a Firestore batch to atomically update request status, create burnBuddy, and delete any other pending requests for the same user pair
- FR-6: `POST /friends/requests/:id/accept` must use a Firestore batch to atomically update request status, create friend document, and delete any other pending requests for the same user pair
- FR-7: The cleanup script must detect orphan pending requests (where relationship already exists), burn buddies without friendships, and requests referencing non-existent users
- FR-8: The cleanup script must support `--dry-run` (default) and `--fix` modes
- FR-9: `GET /diagnostics/relationships` must return a summary of relationship integrity issues
- FR-10: All repairs (script and inline) must be logged with sufficient detail for auditing

## Non-Goals

- No UI changes — this is entirely backend/data integrity work
- No changes to burn squad relationships (out of scope for this fix)
- No real-time monitoring or alerting (the diagnostics endpoint is on-demand)
- No changes to the delete friendship cascade logic (it already correctly cascade-deletes burn buddies and pending requests)
- No Firestore security rules changes

## Dependencies

None

## Technical Considerations

- **Firestore batched writes** are limited to 500 operations per batch. The cleanup script must chunk operations accordingly.
- **Firestore compound queries** (multiple equality filters on different fields) may require composite indexes. The existing queries for `fromUid` + `toUid` + `status` already work, so the reverse-direction check should use the same index pattern.
- The existing test pattern uses `vi.mock` + `vi.hoisted` to stub Firestore — new tests should follow this pattern exactly.
- The diagnostics endpoint extends the existing `/diagnostics` route in `services/api/src/routes/diagnostics.ts`.
- **Why the TLA+ spec didn't catch this bug**: The spec faithfully modeled the code (including the bug), and its INV-4 (`AtMostOnePendingPerDirection`) only checked same-direction duplicates. The comments at line 232-234 even acknowledged cross-directional coexistence as expected behavior. The missing invariant was: "if a burnBuddy exists for a pair, no pending request should exist for that pair in either direction." This is a spec gap — the invariant was never written, so TLC never had a property to violate. US-007 addresses this by first adding the invariant to prove TLC catches the bug, then fixing the actions.

## Success Metrics

- Zero orphan pending requests detected by the diagnostics endpoint after the migration runs
- The specific production bug (16patelr@gmail.com / venyatham inconsistency) is resolved
- No regression in existing burn buddy or friend request test suites
- TLC model checker passes with updated invariants

## Open Questions

- Should the auto-accept behavior (when a reverse pending request exists) send a push notification to both users, or just silently create the relationship? (Current recommendation: silently create, since both users explicitly requested it.)
- Should the cleanup script be idempotent so it can be safely re-run, or is a one-time execution sufficient? (Current recommendation: make it idempotent for safety.)
