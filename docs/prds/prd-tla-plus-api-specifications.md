# PRD: TLA+ Formal Specifications for BurnBuddy API

## Introduction

Add TLA+ formal specifications for all critical BurnBuddy API flows to serve as precise documentation and enable automated verification of safety properties. The specs will model request/response protocols, concurrent operations, Firestore state transitions, and background processes to catch concurrency bugs, prevent race conditions, and ensure API invariants hold under all execution paths.

This effort addresses the need for rigorous correctness guarantees in multi-user, concurrent scenarios (e.g., simultaneous friend requests, group workout detection with overlapping windows, duplicate request prevention) that are difficult to test exhaustively through traditional means.

## Goals

- Create formal TLA+ specifications for 8 API flow domains covering all significant state transitions
- Model concurrent operations between multiple users and background processes
- Define and verify safety invariants (e.g., friend-before-buddy, no duplicate requests, no orphaned relationships)
- Integrate TLC model checker into CI/CD to automatically verify invariants on every PR
- Discover and document any discrepancies between specs and implementation
- Create automated tests for any gaps discovered during verification

## User Stories

### US-001: TLA+ Project Structure and Tooling
**Description:** As a developer, I need the TLA+ specs organized in a clear structure with CI/CD tooling so I can run model checking locally and automatically.

**Acceptance Criteria:**
- [ ] Create `specs/tla/` directory with subdirectories for each domain
- [ ] Create `specs/tla/Common.tla` shared module with: Uid, Timestamp, Status, WorkoutType, WorkoutStatus types
- [ ] Add TLA+ CLI tooling (tla2tools.jar or equivalent) to project dependencies
- [ ] Create GitHub Actions workflow `.github/workflows/tla-model-check.yml` that runs TLC on all `.tla` files
- [ ] Workflow configured with 10-minute timeout per spec
- [ ] Workflow fails if any invariant violations are found
- [ ] Add `README.md` in `specs/tla/` explaining structure and how to run TLC locally
- [ ] Typecheck passes

### US-002: Friend Management Spec
**Description:** As a developer, I need a formal spec of friend request flows so I can verify no duplicate requests or invalid state transitions occur.

**Acceptance Criteria:**
- [ ] Create `specs/tla/friends/FriendManagement.tla` spec
- [ ] Model states: no relationship, pending request, friends
- [ ] Model operations: send request, accept request, delete friend
- [ ] Model concurrent scenarios: two users sending requests simultaneously, accept during delete
- [ ] Define invariants:
  - [ ] At most one pending request in each direction between two users
  - [ ] Friend relationship is symmetric (bidirectional)
  - [ ] Cannot send friend request to self
  - [ ] Cannot accept request user didn't receive
- [ ] TLC verifies all invariants with no violations (model check passes)
- [ ] Document any discrepancies found vs. actual API implementation

### US-003: Burn Buddy Management Spec
**Description:** As a developer, I need a formal spec of burn buddy flows so I can verify friend-before-buddy enforcement and request lifecycle correctness.

**Acceptance Criteria:**
- [ ] Create `specs/tla/burn-buddies/BurnBuddyManagement.tla` spec
- [ ] Model states: no buddy, pending request, active buddy
- [ ] Model operations: send buddy request, accept request, update schedule, delete buddy
- [ ] Model dependency on friend relationship (friendship required)
- [ ] Define invariants:
  - [ ] Cannot create burn buddy request without existing friendship
  - [ ] At most one burn buddy relationship per user pair
  - [ ] Burn buddy UIDs are sorted (uid1 < uid2)
  - [ ] At most one pending request in each direction
  - [ ] Cannot accept request without being recipient
- [ ] TLC verifies all invariants (model check passes)
- [ ] Document any discrepancies found

### US-004: Burn Squad Management Spec
**Description:** As a developer, I need a formal spec of squad operations so I can verify admin permissions, member management, and join request correctness.

**Acceptance Criteria:**
- [ ] Create `specs/tla/burn-squads/BurnSquadManagement.tla` spec
- [ ] Model states: squad with admin, members, pending join requests
- [ ] Model operations: create squad, invite member, accept invite, update settings, delete squad
- [ ] Model admin vs. member permissions
- [ ] Model `onlyAdminsCanAddMembers` setting enforcement
- [ ] Define invariants:
  - [ ] Squad always has exactly one admin
  - [ ] Admin is always in memberUids
  - [ ] Cannot invite non-friends
  - [ ] Only recipient can accept join request
  - [ ] If `onlyAdminsCanAddMembers=true`, only admin can send invites
  - [ ] Only admin can update settings or delete squad
- [ ] TLC verifies all invariants (model check passes)
- [ ] Document any discrepancies found

### US-005: Workout Lifecycle and Group Detection Spec
**Description:** As a developer, I need a formal spec of workout start/end and group workout detection so I can verify deduplication, time windows, and concurrent workout scenarios.

**Acceptance Criteria:**
- [ ] Create `specs/tla/workouts/WorkoutLifecycle.tla` spec
- [ ] Model workout states: active, completed
- [ ] Model operations: start workout, end workout, auto-end stale workouts
- [ ] Model concurrent process: group workout detection (async background)
- [ ] Model 20-minute detection window for buddy and squad group workouts
- [ ] Define invariants:
  - [ ] User can only end their own workouts
  - [ ] Completed workouts have endedAt timestamp
  - [ ] At most one GroupWorkout per buddy/squad per 20-minute window (deduplication)
  - [ ] GroupWorkout for buddy requires both members have active workouts within window
  - [ ] GroupWorkout for squad requires ALL members have active workouts within window
  - [ ] Group workout detection runs asynchronously and doesn't block workout creation response
- [ ] TLC verifies all invariants with concurrent workout starts (model check passes)
- [ ] Document any discrepancies found

### US-006: User Profile Management Spec
**Description:** As a developer, I need a formal spec of profile operations so I can verify username uniqueness, profile picture lifecycle, and atomic username changes.

**Acceptance Criteria:**
- [ ] Create `specs/tla/users/UserProfileManagement.tla` spec
- [ ] Model profile states: nonexistent, created, username reserved
- [ ] Model operations: create profile, update profile, change username, upload/delete profile picture
- [ ] Model username reservation mechanism (usernames collection)
- [ ] Define invariants:
  - [ ] Each username (case-insensitive) is unique across all users
  - [ ] Username changes are atomic (old reservation deleted, new created together)
  - [ ] Profile creation is idempotent (409 if already exists)
  - [ ] Cannot have profile without username reservation
  - [ ] Cannot have orphaned username reservations
- [ ] TLC verifies all invariants (model check passes)
- [ ] Document any discrepancies found

### US-007: Push Notifications Spec
**Description:** As a developer, I need a formal spec of notification flows so I can verify partner/squad member targeting and fire-and-forget error handling.

**Acceptance Criteria:**
- [ ] Create `specs/tla/notifications/PushNotifications.tla` spec
- [ ] Model notification trigger: workout started by user
- [ ] Model concurrent process: notification sending (async background, fire-and-forget)
- [ ] Model recipient collection: burn buddy partners + squad members (excluding self)
- [ ] Define invariants:
  - [ ] Notification failures do not block workout creation response
  - [ ] User never receives notification for their own workout
  - [ ] All burn buddy partners and squad members are targeted
  - [ ] Users without FCM tokens are skipped (no error)
- [ ] TLC verifies all invariants (model check passes)
- [ ] Document any discrepancies found

### US-008: Cross-Domain Invariants Spec
**Description:** As a developer, I need a spec that verifies invariants spanning multiple domains so I can catch relationship dependency violations.

**Acceptance Criteria:**
- [ ] Create `specs/tla/CrossDomainInvariants.tla` spec
- [ ] Import all domain specs (Friends, BurnBuddies, BurnSquads, Workouts, Users)
- [ ] Define cross-domain invariants:
  - [ ] Deleting a friend relationship prevents new burn buddy request creation
  - [ ] Deleting a burn buddy orphans associated GroupWorkouts (by design, document)
  - [ ] Deleting a burn squad orphans associated GroupWorkouts (by design, document)
  - [ ] GroupWorkout references valid burn buddy or squad (referenceId exists)
  - [ ] GroupWorkout.memberUids matches referenced buddy/squad membership at creation time
  - [ ] Profile must exist before user can create friends/buddies/squads/workouts
- [ ] TLC verifies all cross-domain invariants (model check passes)
- [ ] Document any discrepancies found

### US-009: API Implementation Review Against Specs
**Description:** As a developer, I need a documented comparison of TLA+ specs against actual route handler code so I can identify implementation gaps.

**Acceptance Criteria:**
- [ ] Create `specs/tla/VERIFICATION_REPORT.md`
- [ ] For each domain spec, create a checklist mapping invariants to code locations
- [ ] For each invariant, document:
  - [ ] Code file and function where invariant is enforced (or should be)
  - [ ] Status: ✅ correctly implemented, ⚠️ partially implemented, ❌ not enforced
  - [ ] Any discrepancies or gaps found
- [ ] Summary section listing all gaps requiring fixes
- [ ] Reference specific line numbers in route handlers

### US-010: Automated Tests for Discovered Gaps
**Description:** As a developer, I need automated tests covering any gaps found during spec verification so future regressions are caught.

**Acceptance Criteria:**
- [ ] For each gap identified in verification report with status ⚠️ or ❌:
  - [ ] Create or update test in `services/api/src/routes/*.test.ts`
  - [ ] Test verifies the invariant holds (or documents why it doesn't)
- [ ] All new/updated tests pass
- [ ] Link each test back to the TLA+ invariant it verifies (comment reference)
- [ ] Run full API test suite: `cd services/api && yarn test`

### US-011: CI/CD Integration and Documentation
**Description:** As a developer, I need the TLC model checker integrated into CI so specs are automatically verified on every PR.

**Acceptance Criteria:**
- [ ] GitHub Actions workflow `.github/workflows/tla-model-check.yml` created
- [ ] Workflow triggers on: PR changes to `specs/tla/**/*.tla`, `services/api/src/**/*.ts`
- [ ] Workflow runs TLC on all `.tla` files in parallel
- [ ] Workflow fails PR if any invariant violations found
- [ ] Workflow posts comment on PR with TLC output if violations occur
- [ ] `specs/tla/README.md` documents:
  - [ ] How to install TLA+ Toolbox (GUI) for local development
  - [ ] How to run TLC CLI for a single spec: `java -cp tla2tools.jar tlc2.TLC SpecName.tla`
  - [ ] How to interpret TLC output (invariant violations, state space size)
  - [ ] Link to TLA+ learning resources
- [ ] Typecheck passes

## Functional Requirements

### TLA+ Specifications
- FR-1: Create 7 domain-specific TLA+ specs modeling request/response protocols, state transitions, and Firestore operations
- FR-2: Create 1 cross-domain invariants spec importing all domain specs
- FR-3: Each spec must define at least 3 safety invariants relevant to that domain
- FR-4: Model concurrent operations: multiple users performing actions simultaneously, async background processes
- FR-5: Use TLA+ standard modules: `Naturals`, `Sequences`, `FiniteSets`, `TLC`
- FR-6: Define bounded state space for model checking (e.g., max 3 users, max 5 workouts)

### Model Checking
- FR-7: Use TLC model checker to verify all invariants hold
- FR-8: Configure TLC with appropriate bounds (state space exploration limits)
- FR-9: Model check must complete in under 10 minutes per spec
- FR-10: Document any invariants that cannot be verified due to state space explosion

### CI/CD Integration
- FR-11: GitHub Actions workflow runs TLC on all specs on PR changes
- FR-12: Workflow fails if any spec has invariant violations
- FR-13: Workflow posts TLC error output as PR comment
- FR-14: Workflow runs in parallel for each spec file

### Verification and Gap Analysis
- FR-15: Create verification report mapping each TLA+ invariant to implementation code
- FR-16: Document all gaps where invariants are not enforced in code
- FR-17: Create automated tests for each identified gap
- FR-18: Tests must reference the TLA+ spec and invariant they verify

### Documentation
- FR-19: `specs/tla/README.md` explains directory structure, how to run TLC, how to interpret output
- FR-20: Each `.tla` file includes inline comments explaining the model
- FR-21: Verification report includes summary of all findings with severity (critical/medium/low)

## Non-Goals (Out of Scope)

- No liveness properties (eventual delivery, eventual consistency) - focus on safety only
- No performance modeling or quantitative analysis
- No exhaustive state space exploration beyond configured bounds
- No formal verification of Firebase/Firestore behavior itself (black box)
- No TLA+ training materials, workshops, or team education
- No integration with existing API tests (separate verification path)
- No dashboard specification (read-only aggregation, low risk)
- No metrics/vitals endpoint specification (non-critical logging)

## Dependencies

- prd-site-performance-non-dashboard.md — The TLA+ specs will formally verify API behavior, but performance characteristics (response times, throughput) should be established first to inform model checking bounds and assumptions.

## Design Considerations

### TLA+ Spec Organization
```
specs/
└── tla/
    ├── README.md                           # Tooling guide
    ├── VERIFICATION_REPORT.md              # Gap analysis
    ├── Common.tla                          # Shared types module
    ├── friends/
    │   └── FriendManagement.tla
    ├── burn-buddies/
    │   └── BurnBuddyManagement.tla
    ├── burn-squads/
    │   └── BurnSquadManagement.tla
    ├── workouts/
    │   └── WorkoutLifecycle.tla
    ├── users/
    │   └── UserProfileManagement.tla
    ├── notifications/
    │   └── PushNotifications.tla
    └── CrossDomainInvariants.tla
```

### Priority Order (Incremental Implementation)
Based on risk and complexity, implement specs in this order:

1. **High Priority (Most Complex/Risky):**
   - US-005: Workout Lifecycle (group detection, concurrency, time windows)
   - US-002: Friend Management (bidirectional relationships, duplicate prevention)
   - US-003: Burn Buddy Management (friend dependency, request lifecycle)

2. **Medium Priority:**
   - US-004: Burn Squad Management (multi-member, permissions, settings)
   - US-006: User Profile Management (username uniqueness, atomicity)
   - US-008: Cross-Domain Invariants (relationship dependencies)

3. **Lower Priority:**
   - US-007: Push Notifications (fire-and-forget, error handling)

### TLC Configuration
- Model check with 2-3 users to keep state space manageable
- Limit workouts per user to 3-5
- Limit burn buddies/squads per user to 2-3
- Use symmetry sets for users where possible
- Set depth limit if state space too large

### Concurrency Modeling
- Use TLA+ processes (`process`) for background tasks (group detection, notifications, auto-end)
- Use interleaving semantics for concurrent user actions
- Model Firestore as atomic operations (transactions where needed)

## Technical Considerations

### TLA+ Tooling
- **TLA+ Toolbox:** Recommended for spec development (GUI, syntax highlighting, interactive model checking)
- **TLC CLI:** Required for CI/CD automation (`java -cp tla2tools.jar tlc2.TLC`)
- **tla2tools.jar version:** Use latest stable (e.g., 1.8.0)

### State Space Management
- Group workout detection with time windows uses abstract time states (BeforeWindow, WithinWindow, AfterWindow)
- Auto-end stale workouts uses StaleThreshold time state
- Use `ASSUME` statements to constrain initial states
- Use `CONSTANTS` for configuration (e.g., `GROUP_WORKOUT_WINDOW = 20`)
- Username collision retries bounded to max 3 attempts

### Integration with Existing Tests
- TLA+ specs are separate verification layer, not replacement for unit/integration tests
- Gaps found via TLA+ should result in new unit tests
- Unit tests verify concrete implementation, TLA+ verifies abstract protocol

### Firestore Modeling
- Model collections as sets or functions (e.g., `users: [Uid -> UserProfile]`)
- Model queries as set operations (filter, map)
- Model transactions as atomic state transitions
- Abstract away Firebase Admin SDK details

## Success Metrics

- **Spec Coverage:** All 8 domains have complete TLA+ specifications
- **Invariant Coverage:** Minimum 25 safety invariants defined across all specs
- **Model Checking:** All specs pass TLC verification with no invariant violations
- **CI Integration:** TLC runs automatically on every PR, fails on violations
- **Gap Discovery:** Verification report documents at least 5 implementation gaps
- **Test Coverage:** 100% of identified gaps have corresponding automated tests
- **Documentation:** `specs/tla/README.md` has instructions for running TLC locally and interpreting results

## Design Decisions (Resolved Open Questions)

### Firestore Consistency Model
**Decision:** Assume strong consistency (matches Firestore default mode)
- Model all reads as seeing the latest writes immediately
- Simpler specs, easier to reason about
- Firestore provides strong consistency by default for document reads

### Time Window Modeling (20-Minute Group Workout Detection)
**Decision:** Abstract time into 3 states: before window, within window, after window
- Avoids state space explosion from modeling 20 discrete minutes
- Sufficient to verify deduplication and window logic
- Each workout has a time state: `BeforeWindow | WithinWindow | AfterWindow`
- Time progresses non-deterministically (TLC explores all orderings)

### Auto-End Stale Workouts (90 Minutes)
**Decision:** Model with abstract time states
- Consistent with group workout time window approach
- Add `StaleThreshold` time state (after 90 minutes)
- Verify that stale workouts transition to completed automatically

### Firebase Auth Token Lifecycle
**Decision:** Assume tokens are always valid
- Auth is out of scope for API state machine verification
- Focus on post-authentication business logic
- Document assumption: "All requests have valid auth tokens"

### Username Collision Retries
**Decision:** Fully model with bounded retries (max 3 attempts)
- Important for verifying username uniqueness invariant
- Model retry logic: `baseUsername`, `baseUsername2`, `baseUsername3`
- Verify that retries maintain atomicity (no partial reservation states)

### TLC Timeout in CI
**Decision:** 10 minutes per spec, separate CI pipeline
- Create dedicated workflow: `.github/workflows/tla-model-check.yml`
- Runs independently from main CI (doesn't block fast checks)
- Timeout per spec: 10 minutes (configurable via workflow input)
- Total pipeline timeout: 90 minutes (8 specs × 10 min + overhead)

### Shared TLA+ Module
**Decision:** Create shared module for common types
- Module: `specs/tla/Common.tla`
- Includes: `Uid`, `Timestamp`, `Status` (pending/accepted), `WorkoutType`, `WorkoutStatus`
- Benefits: consistency across specs, DRY principle, easier refactoring
- Each domain spec imports: `EXTENDS Common`
