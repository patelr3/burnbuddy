# PRD: Monthly Points System

## Introduction

Add a points system to BurnBuddy that rewards users for group workouts. Each time a group workout is detected (buddy or squad), every participating user earns 1 point. Points accumulate over the calendar month and reset on the 1st. A rolling 12-month history is stored so users can track their engagement over time. Points are displayed on the user's own profile only (not visible to friends).

## Goals

- Motivate users to participate in more group workouts by giving tangible, trackable rewards
- Provide a simple monthly cadence that resets motivation each month
- Store 12 months of history so users can see engagement trends
- Keep the system lightweight — 1 point per group workout, no complex scoring

## User Stories

### US-001: Store monthly points in Firestore

**Description:** As a developer, I need a data model to store per-user monthly point totals so that points persist and can be queried efficiently.

**Acceptance Criteria:**
- [ ] Create a `MonthlyPoints` type in `packages/shared/src/types.ts` with fields: `uid`, `month` (YYYY-MM format), `points` (number), `updatedAt` (ISO 8601 string)
- [ ] Firestore collection: `monthlyPoints` with composite document ID `${uid}_${YYYY-MM}`
- [ ] Build shared package successfully after type changes (`cd packages/shared && yarn build`)
- [ ] Typecheck passes (`cd services/api && npx tsc --noEmit`)

### US-002: Award a point when a group workout is detected

**Description:** As a user, I want to automatically earn 1 point whenever a group workout is detected so that I'm rewarded for working out with my buddies or squad.

**Acceptance Criteria:**
- [ ] When `detectGroupWorkouts()` creates a new `GroupWorkout`, increment the current month's point total by 1 for **every user** in `GroupWorkout.memberUids`
- [ ] Use Firestore `FieldValue.increment(1)` for atomic updates (no read-before-write race conditions)
- [ ] If the `monthlyPoints` document does not exist for the current month, create it with `points: 1`
- [ ] Point awarding runs as a background side-effect (fire-and-forget), same pattern as push notifications — errors are logged but do not fail the workout creation request
- [ ] Write unit tests following the existing API test pattern (`vi.mock` + `vi.hoisted` + `supertest`)
- [ ] Tests verify: point document created on first group workout, point incremented on subsequent group workouts, all group members receive points
- [ ] Typecheck passes

### US-003: API endpoint to get current month's points

**Description:** As a user, I want to see how many points I've earned this month so I can track my progress.

**Acceptance Criteria:**
- [ ] `GET /users/me/points` returns `{ currentMonth: { month: "YYYY-MM", points: number }, history: MonthlyPoints[] }`
- [ ] `currentMonth` returns the current calendar month's points (0 if no document exists)
- [ ] `history` returns up to the last 12 months of point records, sorted newest-first, excluding the current month
- [ ] Endpoint requires authentication (`requireAuth` middleware)
- [ ] Write unit tests: no points returns 0, returns correct current month, returns history sorted correctly, only returns the user's own points
- [ ] Typecheck passes

### US-004: Display points on user's own profile in the web app

**Description:** As a user, I want to see my current month's points on my profile page so I feel motivated to keep working out.

**Acceptance Criteria:**
- [ ] Profile page shows a "Monthly Points" card/section displaying the current month's point total
- [ ] Shows a flame/fire emoji or icon next to the point count for visual appeal
- [ ] If points are 0, show "0" with encouraging text (e.g., "Start a group workout to earn points!")
- [ ] Card also shows a small sparkline or simple list of the last few months' totals for trend context
- [ ] Points data is fetched from `GET /users/me/points` when the profile page loads
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Prune point history older than 12 months

**Description:** As a developer, I want to keep the `monthlyPoints` collection lean by removing records older than 12 months.

**Acceptance Criteria:**
- [ ] When writing a new month's points (in US-002's increment logic), check if the user has any `monthlyPoints` documents older than 12 months and delete them
- [ ] Pruning runs as a background side-effect (fire-and-forget) — errors are logged but do not block the main flow
- [ ] Write unit tests verifying: documents older than 12 months are deleted, documents within 12 months are kept
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Add `MonthlyPoints` type to `@burnbuddy/shared` with fields: `uid` (string), `month` (string, YYYY-MM), `points` (number), `updatedAt` (string, ISO 8601)
- FR-2: Store monthly points in Firestore collection `monthlyPoints` with document ID `${uid}_${YYYY-MM}`
- FR-3: When a `GroupWorkout` is created, atomically increment the current month's point total by 1 for each user in `memberUids` using `FieldValue.increment(1)`
- FR-4: If no `monthlyPoints` document exists for the user+month, create one with `points: 1` (upsert via Firestore `set` with `merge: true`)
- FR-5: Expose `GET /users/me/points` endpoint returning current month points and up to 12 months of history
- FR-6: The points endpoint must only return the authenticated user's own points (no access to other users' points)
- FR-7: Display current month's points on the user's own profile page in the web app
- FR-8: Delete `monthlyPoints` documents older than 12 months during point writes (background cleanup)
- FR-9: All point operations (awarding, pruning) run as fire-and-forget background tasks — errors must not fail the parent request

## Non-Goals

- No leaderboard or ranking among friends/buddies
- No points for solo workouts — only group workouts earn points
- No variable point values (e.g., squad vs buddy) — always 1 point
- No points visible on friend profiles — own profile only
- No push notifications for earning points
- No achievements, badges, or milestone rewards based on points
- No manual point adjustment or admin panel

## Dependencies

None

## Technical Considerations

- **Atomic increments:** Use `FieldValue.increment(1)` with `set({ points: FieldValue.increment(1) }, { merge: true })` to avoid read-before-write race conditions when multiple group workouts are detected simultaneously
- **Month calculation:** Use UTC dates for month boundaries (consistent with existing `StreakDayInfo` which uses UTC). Format: `YYYY-MM` (e.g., `2026-03`)
- **Document ID format:** `${uid}_${YYYY-MM}` allows direct document lookups without queries for the current month, and simple `where('uid', '==', uid)` queries for history
- **Fire-and-forget pattern:** Follow the existing pattern in `workouts.ts` where group workout detection and push notifications run as background promises with swallowed errors
- **Existing integration point:** The point increment should be triggered inside or immediately after `detectGroupWorkouts()` in `group-workout-detection.ts`, since that's where `GroupWorkout` documents are created
- **No new Firestore indexes required:** The history query (`uid == X`, ordered by `month` desc) only uses a single equality filter + ordering on a single field

## Success Metrics

- Users can see their current month's group workout point total on their profile
- Points increment correctly each time a group workout is detected
- Monthly history accurately reflects the last 12 months of point data
- No performance regression on workout creation (point logic is non-blocking)

## Open Questions

- Should the monthly history visualization be a bar chart, sparkline, or simple number list? (Deferred to implementation — start with simple list, iterate based on feedback)
- If a user is in both a buddy pair AND a squad that both detect group workouts from the same underlying workout session, should they earn 1 point or 2? (Proposed: 2 points — they are distinct group workout records, and this incentivizes having both buddies and squads)
