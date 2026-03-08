# PRD: TLA+ Verification Gap Fixes & CI Unblock

## Introduction

The TLA+ formal specification suite verified 45 invariants across the BurnBuddy API. A verification report (`specs/tla/VERIFICATION_REPORT.md`) identified 4 implementation gaps where the code does not fully enforce the spec's invariants. Additionally, tests written to *document* these gaps introduced a TypeScript error that is blocking the Deploy API workflow's Quality Checks step. This PRD fixes all 4 gaps and unblocks CI.

## Goals

- Unblock the Deploy API GitHub Actions workflow by resolving the TypeScript error in `burn-buddies.test.ts:1006`
- Fix all 4 TLA+ verification gaps (G-1, G-2, G-3, G-4) so the API implementation matches the formal specification
- Bring the verification report from 84% (38/45 invariants correct) to 100% (45/45)
- Maintain full backward compatibility — no breaking changes to API contracts

## User Stories

### US-001: Fix CI Typecheck Error in Burn Buddy Tests

**Description:** As a developer, I need the Deploy API workflow to pass Quality Checks so that code changes can be deployed to beta and production.

**Acceptance Criteria:**
- [ ] Fix the TypeScript error at `services/api/src/routes/burn-buddies.test.ts:1006` — the `as string` cast on an empty tuple `mockBBDocRef.mock.calls[0]?.[0]` fails typecheck
- [ ] Update the gap-documenting test assertions to expect the *correct* behavior (sorted composite key) instead of asserting the broken behavior
- [ ] `yarn typecheck` passes locally (at minimum `cd services/api && npx tsc --noEmit`)
- [ ] `cd services/api && yarn test` passes with all tests green

### US-002: Fix G-1 — Use Sorted Composite Key for Burn Buddy Docs

**Description:** As a user, I want only one Burn Buddy relationship per friend pair so that accepting cross-requests (A→B and B→A) doesn't create duplicate records.

**Acceptance Criteria:**
- [ ] In `services/api/src/routes/burn-buddies.ts`, the accept handler creates the `BurnBuddy` doc with ID `${uid1}_${uid2}` (sorted composite key) instead of `randomUUID()`
- [ ] The `BurnBuddy.id` field also uses the sorted composite key (matching the doc ID)
- [ ] If a `BurnBuddy` doc already exists for the pair (second accept of a cross-request), return 409 Conflict instead of creating a duplicate
- [ ] Update existing tests in `burn-buddies.test.ts` that assert random UUID behavior to assert composite key behavior
- [ ] Add a test: accepting a cross-request when a BurnBuddy already exists returns 409
- [ ] `cd services/api && yarn test` passes

### US-003: Fix G-4 — Add requireProfile Middleware for Social Actions

**Description:** As a system, I need to enforce that users have a Firestore profile before performing social actions (friend requests, buddy requests, squad creation, starting workouts) so that orphaned social data isn't created.

**Acceptance Criteria:**
- [ ] Create `services/api/src/middleware/requireProfile.ts` following the pattern of `middleware/auth.ts`
- [ ] The middleware fetches the user's profile from Firestore (`users/{uid}`) and returns 403 with `{ error: 'Profile required' }` if it doesn't exist
- [ ] Attach the profile to `req` (e.g., `req.profile`) for downstream use if beneficial, typed via the Express augmentation in `types/express.d.ts`
- [ ] Apply `requireProfile` after `requireAuth` on these routes:
  - `POST /friends/requests` in `friends.ts`
  - `POST /burn-buddies/requests` in `burn-buddies.ts`
  - `POST /burn-squads` in `burn-squads.ts`
  - `POST /workouts` in `workouts.ts`
- [ ] Update the gap-documenting test in `burn-buddies.test.ts` (G-4 section) to assert the correct behavior (403 when no profile)
- [ ] Add tests in each affected route's test file verifying that requests without a profile return 403
- [ ] `cd services/api && yarn test` passes

### US-004: Fix G-3 — Username Uniqueness Race Condition

**Description:** As a user, I want my username to be truly unique so that concurrent profile creations can't claim the same username.

**Acceptance Criteria:**
- [ ] In `services/api/src/lib/username.ts`, use Firestore `doc.create()` (which fails if the doc already exists) instead of `doc.set()` for the username reservation, OR wrap the read-check-write in a Firestore transaction
- [ ] In `services/api/src/routes/users.ts`, the profile creation flow handles the `ALREADY_EXISTS` error from `doc.create()` by retrying with the next suffix
- [ ] Add a unit test that simulates a concurrent claim (mock `doc.create()` to fail with ALREADY_EXISTS on first attempt, succeed on retry)
- [ ] Existing username-related tests still pass
- [ ] `cd services/api && yarn test` passes

### US-005: Fix G-2 — Explicit Self-Invite Check in Squad Member Add

**Description:** As a system, I need an explicit guard against self-invites in squad member additions so that the invariant doesn't rely on a cross-domain assumption.

**Acceptance Criteria:**
- [ ] In `services/api/src/routes/burn-squads.ts`, add `if (memberUid === uid) return res.status(400).json({ error: 'Cannot invite yourself' })` before the friendship check in `POST /:id/members`
- [ ] Add a test in `burn-squads.test.ts`: attempting to add yourself as a member returns 400
- [ ] `cd services/api && yarn test` passes

### US-006: Update Verification Report

**Description:** As a developer, I want the verification report to reflect the current implementation so that it stays accurate and trustworthy.

**Acceptance Criteria:**
- [ ] Update `specs/tla/VERIFICATION_REPORT.md` — change all 4 gap entries from ⚠️/❌ to ✅
- [ ] Update the gap descriptions to note they have been fixed, with the commit or PR reference
- [ ] Update the summary table to show 45/45 invariants correctly implemented
- [ ] Remove or mark the "Summary of Gaps" section as resolved

## Functional Requirements

- FR-1: `BurnBuddy` documents must use sorted composite key `${uid1}_${uid2}` as the Firestore doc ID, preventing duplicates at the storage layer
- FR-2: Accepting a burn buddy request when a `BurnBuddy` doc already exists for the pair must return 409 Conflict
- FR-3: A new `requireProfile` Express middleware must verify Firestore profile existence and return 403 if missing
- FR-4: `requireProfile` must be applied to all social action creation endpoints (`POST /friends/requests`, `POST /burn-buddies/requests`, `POST /burn-squads`, `POST /workouts`)
- FR-5: Username reservation must use `doc.create()` or a Firestore transaction to prevent concurrent claims
- FR-6: `POST /burn-squads/:id/members` must explicitly reject `memberUid === uid` with 400
- FR-7: All existing API tests must continue to pass after changes
- FR-8: The Deploy API GitHub Actions workflow Quality Checks must pass

## Non-Goals

- No migration of existing duplicate BurnBuddy documents (if any exist in production) — that's a separate data cleanup task
- No changes to the TLA+ specifications themselves — they are correct
- No changes to the TLA+ CI workflow (`tla-model-check.yml`)
- No changes to the web or mobile apps
- No new API endpoints — only behavior changes to existing ones
- No performance optimization of the requireProfile middleware (caching profile lookups can be done later)

## Dependencies

None

## Technical Considerations

- **Firestore `doc.create()`**: Unlike `doc.set()`, `create()` fails with a `ALREADY_EXISTS` (code 6) error if the document exists. This is the recommended pattern for uniqueness enforcement.
- **Middleware ordering**: `requireProfile` must run after `requireAuth` since it needs `req.user.uid` to look up the profile. The route declaration order is `requireAuth, requireProfile, handler`.
- **Test mocking**: All tests mock Firestore via `vi.mock` + `vi.hoisted`. The `requireProfile` middleware will need a mock for the user profile doc's `.get()` call. Ensure each test file that adds `requireProfile` sets up the profile mock in `beforeEach`.
- **Express augmentation**: If attaching the profile to `req`, extend the type in `services/api/src/types/express.d.ts` to include `profile?: UserProfile`.
- **Backward compatibility**: The 403 from `requireProfile` is a new error response for users without profiles. This is intentional — such users should not have been able to perform these actions.

## Success Metrics

- Deploy API workflow passes Quality Checks on the PR and on merge to main
- TLA+ verification report shows 45/45 (100%) invariants correctly implemented
- All API unit tests pass (`cd services/api && yarn test`)
- TypeScript typecheck passes (`yarn typecheck` for API workspace)

## Open Questions

- Should `requireProfile` also apply to read-only social endpoints (e.g., `GET /friends`), or only mutation endpoints?
- Should we add rate limiting to profile creation to further mitigate the username race condition?
