# PRD: Join Workout Button with Countdown Timer

## Introduction

When a burn buddy or squad member starts a workout, their partners currently have no real-time visibility into this on the home page. This feature adds a "Join Workout" button with a live countdown timer to each buddy/squad card, showing how long the user has to start their own workout so it counts as a group workout. This leverages the existing 20-minute group workout detection window — if both buddies (or all squad members) start workouts within 20 minutes of each other, a `GroupWorkout` is automatically created.

## Goals

- Give users instant visibility into when a buddy or squad member is actively working out
- Provide a clear call-to-action ("Join Workout") that reduces friction for starting a group workout
- Display a live countdown so users understand urgency and the group workout time window
- Increase group workout frequency by making it easy to join an in-progress session

## User Stories

### US-001: Export shared group workout window constant
**Description:** As a developer, I need the group workout time window constant available in both the API and web app so both use the same value.

**Acceptance Criteria:**
- [ ] `GROUP_WORKOUT_WINDOW_MS` (20 minutes = `20 * 60 * 1000`) is exported from `@burnbuddy/shared`
- [ ] `group-workout-detection.ts` imports the constant from `@burnbuddy/shared` instead of defining it locally
- [ ] Typecheck passes (`yarn typecheck`)

### US-002: Add ActivePartnerWorkout shared type
**Description:** As a developer, I need a shared type for the API response that tells the frontend which buddies/squads have active partner workouts.

**Acceptance Criteria:**
- [ ] `ActivePartnerWorkout` interface exported from `@burnbuddy/shared` with fields: `type` (`'buddy' | 'squad'`), `referenceId` (`string`), `earliestStartedAt` (`string` — ISO 8601)
- [ ] Type is re-exported from `packages/shared/src/index.ts`
- [ ] Typecheck passes (`yarn typecheck`)

### US-003: Add GET /workouts/partner-active API endpoint
**Description:** As a frontend client, I want to fetch which of my burn buddies and squad members currently have active workouts within the group workout window, so I can display "Join Workout" buttons.

**Acceptance Criteria:**
- [ ] `GET /workouts/partner-active` endpoint exists, protected by `requireAuth`
- [ ] Response shape: `{ groupWorkoutWindowMs: number, activePartnerWorkouts: ActivePartnerWorkout[] }`
- [ ] For each burn buddy: includes an entry if the partner (not the current user) has an active workout started within the last 20 minutes
- [ ] For each burn squad: includes an entry if ANY non-self member has an active workout started within the last 20 minutes; `earliestStartedAt` is the earliest such workout's `startedAt`
- [ ] Returns empty `activePartnerWorkouts` array when no partners have active workouts
- [ ] Uses `getDb()` for Firestore access (not `admin.firestore()` directly)
- [ ] Typecheck passes (`yarn typecheck`)

### US-004: Add tests for partner-active endpoint
**Description:** As a developer, I need automated tests for the new endpoint to prevent regressions.

**Acceptance Criteria:**
- [ ] Test: returns empty array when no partners have active workouts
- [ ] Test: returns buddy entry when partner has active workout within 20-minute window
- [ ] Test: excludes buddy entry when partner's workout started more than 20 minutes ago
- [ ] Test: returns squad entry when a squad member has active workout within window
- [ ] Test: returns correct `earliestStartedAt` for squad with multiple active members
- [ ] Test: handles user with no buddies or squads (empty response)
- [ ] Tests follow existing pattern: `vi.hoisted` + `vi.mock` + `supertest` + `buildApp()`
- [ ] All tests pass (`cd services/api && yarn test`)

### US-005: Fetch active partner workouts on home page
**Description:** As a developer, I need the home page to fetch and store active partner workout data so the UI can display "Join Workout" buttons.

**Acceptance Criteria:**
- [ ] `loadData()` in `page.tsx` includes a call to `GET /workouts/partner-active`
- [ ] `groupWorkoutWindowMs` and a map of `referenceId → earliestStartedAt` are stored in component state
- [ ] `CombinedItem` interface extended with optional `activePartnerStartedAt?: string` field
- [ ] Each buddy/squad item is populated with `activePartnerStartedAt` from the map during item construction
- [ ] Failure to fetch partner-active data does not block page load (`.catch()` fallback)
- [ ] Typecheck passes (`yarn typecheck`)

### US-006: Render "Join Workout" button with countdown on buddy/squad cards
**Description:** As a user, I want to see a "Join Workout" button with a countdown timer on each buddy/squad card where a partner is currently working out, so I can quickly start my own workout and have it count as a group workout.

**Acceptance Criteria:**
- [ ] Each buddy/squad card shows a "Join Workout" button when `activePartnerStartedAt` is set and the user does NOT have an active workout
- [ ] A live countdown is displayed in `MM:SS` format, calculated as `(earliestStartedAt + groupWorkoutWindowMs) - now`
- [ ] Countdown updates every second
- [ ] When countdown is under 5 minutes, the countdown text turns red to indicate urgency
- [ ] When countdown reaches 0, the "Join Workout" button and countdown are hidden
- [ ] Button is NOT shown when the user already has an active workout
- [ ] Typecheck passes (`yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-007: Join Workout click opens workout type selector
**Description:** As a user, when I click "Join Workout" I want to choose my own workout type (not be forced into the same type as my partner), then have my workout start.

**Acceptance Criteria:**
- [ ] Clicking "Join Workout" opens the existing workout type selector modal (same as "Start Workout")
- [ ] User picks from the standard workout type grid (Weightlifting, Running, Cycling, etc.)
- [ ] After selecting type and confirming, a `POST /workouts` call creates the workout
- [ ] After workout starts: user stays on the home page, active workout banner appears, "Join" buttons disappear
- [ ] Page data refreshes after workout creation
- [ ] Typecheck passes (`yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-008: Auto-poll for new active partner workouts
**Description:** As a user, I want the home page to automatically detect when a buddy starts a workout (without manually refreshing), so the "Join Workout" button appears promptly.

**Acceptance Criteria:**
- [ ] Home page polls `GET /workouts/partner-active` every 30 seconds
- [ ] Polling starts when the page mounts and stops on unmount
- [ ] Polling pauses (or is unnecessary) while the user has an active workout
- [ ] New "Join Workout" buttons appear within ~30 seconds of a partner starting a workout
- [ ] No excessive re-renders or flickering during poll updates
- [ ] Typecheck passes (`yarn typecheck`)

## Functional Requirements

- **FR-1:** Add `GROUP_WORKOUT_WINDOW_MS` constant (value: `1200000`) to `@burnbuddy/shared` package exports
- **FR-2:** Add `ActivePartnerWorkout` interface to `@burnbuddy/shared` with fields `type`, `referenceId`, and `earliestStartedAt`
- **FR-3:** Implement `GET /workouts/partner-active` API endpoint that returns active partner workouts within the 20-minute window for the authenticated user's burn buddies and burn squads
- **FR-4:** For burn buddy detection: query both `uid1` and `uid2` directions (matching existing pattern in `group-workout-detection.ts`)
- **FR-5:** For burn squad detection: query squads where user is a member via `memberUids` array-contains, then check each non-self member for active workouts
- **FR-6:** The `earliestStartedAt` field must be the earliest `startedAt` among all active partner/member workouts for that buddy/squad (this determines the countdown deadline)
- **FR-7:** The home page fetches partner-active data on load and polls every 30 seconds
- **FR-8:** Display a "Join Workout" button and `MM:SS` countdown on each buddy/squad card that has an active partner workout
- **FR-9:** Countdown text turns red when under 5 minutes remaining
- **FR-10:** "Join Workout" button is hidden when the user already has an active workout
- **FR-11:** "Join Workout" button is hidden when the countdown reaches zero
- **FR-12:** Clicking "Join Workout" opens the existing workout type selector modal; user picks their own type
- **FR-13:** After starting a workout via "Join", the user stays on the home page and the active workout banner appears

## Non-Goals

- No push notifications for "your buddy just started a workout" (existing push notification system handles this separately)
- No display of the partner's workout type on the card
- No "auto-join" — the user must always choose their own workout type
- No real-time WebSocket/SSE updates — polling every 30 seconds is sufficient
- No changes to the group workout detection logic itself — we rely on the existing 20-minute window
- No changes to the burn buddy or burn squad detail pages
- No mobile app changes (Expo app) in this iteration

## Design Considerations

- **Card layout:** The "Join Workout" button and countdown should appear below the existing "last group workout" / "next workout" text on the left side of the card, keeping the streak display on the right
- **Button style:** Use a prominent green or orange button that stands out from the card background, consistent with the existing design system (Tailwind utility classes)
- **Countdown urgency:** Text color transitions from normal (gray/default) to red when under 5 minutes — simple CSS class swap, no animation needed
- **Modal reuse:** Reuse the existing workout type selector modal (`showWorkoutSelector` state) rather than creating a new one
- **Responsiveness:** The button and countdown should not break the card layout on narrow screens

## Technical Considerations

- **Firestore queries:** The new endpoint queries `burnBuddies`, `burnSquads`, and `workouts` collections. Follow the existing pattern of simple single-field queries with in-memory filtering to avoid composite index requirements
- **Performance:** The endpoint makes N+1 queries (buddy/squad list + workout check per partner). For users with many buddies this could be slow. Acceptable for MVP; optimize later with batch queries if needed
- **Shared constant:** Moving `GROUP_WORKOUT_WINDOW_MS` to the shared package ensures the API detection logic and frontend countdown use the same value. If this value changes, both stay in sync
- **Polling:** 30-second interval is a balance between responsiveness and API load. Uses `setInterval` with cleanup in `useEffect`
- **Existing test pattern:** New tests must use `vi.hoisted` + `vi.mock` for firebase-admin and Firestore stubs (no emulators)

## Success Metrics

- "Join Workout" button appears on buddy/squad cards within 30 seconds of a partner starting a workout
- Countdown is accurate to within 1 second of the actual remaining time
- Clicking "Join Workout" → selecting type → workout starts in under 3 clicks
- Group workout frequency increases (measurable via existing `groupWorkouts` collection)
- No regression in home page load time (partner-active fetch runs in parallel with existing data loads)

## Open Questions

- Should we add a visual indicator (e.g., a green dot) on the buddy card even when the user already has an active workout, to show the partner is working out too?
- Should the polling interval be configurable or is 30 seconds fixed?
- Should the "Join Workout" button also appear on the buddy/squad detail pages in a future iteration?
