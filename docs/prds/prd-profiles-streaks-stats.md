# PRD: Profiles, Streaks & Stats Overhaul

## Introduction

BurnBuddy currently lacks user profiles, detailed workout stats, and has limited streak logic. This PRD covers five interconnected improvements: merging the settings and account pages, adding friend profile views, enriching burn buddy/squad detail pages with stats, overhauling the streak calculation logic, and enhancing the Burn Buddies & Squads listing cards. Together, these changes simplify navigation while giving users more visibility into their (and their friends') progress — driving engagement and motivation.

## Goals

- Reduce page count by merging Settings into the Account page
- Let users view any friend's profile with meaningful workout stats
- Surface richer stats (highest streaks, first workout, workout counts) on buddy/squad detail pages
- Make streaks more intuitive: increment on any overlapping workout (within 20 min), reset after 1 week of inactivity
- Make the Burn Buddies & Squads listing cards more informative (next workout, fire emoji streaks)

## User Stories

### US-001: Merge Settings into Account Page

**Description:** As a user, I want a single Account page that includes both my profile info and settings so I don't have to navigate between two separate pages.

**Acceptance Criteria:**
- [ ] Account page (`/account`) includes username editing (currently on `/settings`)
- [ ] Account page retains existing functionality: display name, sign out, onboarding toggle
- [ ] Settings page (`/settings`) is removed; any links to it redirect to `/account`
- [ ] NavBar updated to remove Settings link if present
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-002: Friend Profile API Endpoints

**Description:** As a developer, I need API endpoints that return a user's profile stats so the frontend can render friend profiles.

**Acceptance Criteria:**
- [ ] `GET /users/:uid/profile` returns: displayName, username, highestActiveStreak (value + buddy/squad name), highestStreakEver (value + date + buddy/squad name), firstWorkoutDate, workoutsAllTime, workoutsThisMonth
- [ ] Endpoint requires authentication (user must be logged in)
- [ ] Endpoint only returns data if the requesting user is a friend of the target user (return 403 otherwise)
- [ ] Returns the burn buddy relationship status between requester and target: `none`, `pending_sent`, `pending_received`, or `buddies`
- [ ] All API tests pass (`cd services/api && yarn test`)
- [ ] Typecheck passes

---

### US-003: Friend Profile Page (Frontend)

**Description:** As a user, I want to tap on a friend's name on the Friends page and see their profile with workout stats so I can see how active they are.

**Acceptance Criteria:**
- [ ] Friends list items on `/friends` are clickable and navigate to `/profile/[uid]`
- [ ] Profile page displays: username, display name, highest active streak (with buddy/squad name), highest streak ever achieved (with date and buddy/squad name), first workout logged date, total workouts all time, total workouts this month
- [ ] "Request to be Burn Buddy" button visible near the top-right if the viewer is NOT already a buddy with this user
- [ ] Button hidden when already buddies or when a pending request exists
- [ ] Loading and error states handled gracefully
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-004: Burn Buddy / Burn Squad Detail Page Stats

**Description:** As a user, I want to see richer stats on the burn buddy and burn squad detail pages so I can track our progress together.

**Acceptance Criteria:**
- [ ] Detail pages (`/burn-buddies/[id]`, `/burn-squads/[id]`) show: active streaks (already done), highest streak achieved with the date it was reached, date of the first workout logged together, total number of workouts logged together all time, total number of workouts logged together this month
- [ ] Stats are fetched from the API (new or extended endpoints as needed)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-005: Buddy/Squad Stats API Endpoints

**Description:** As a developer, I need API endpoints that return group workout stats (highest streak ever, first workout, workout counts) for a given burn buddy or squad.

**Acceptance Criteria:**
- [ ] `GET /burn-buddies/:id/stats` returns: highestStreakEver (value + date), firstGroupWorkoutDate, groupWorkoutsAllTime, groupWorkoutsThisMonth
- [ ] `GET /burn-squads/:id/stats` returns the same shape of data
- [ ] Only members of the buddy pair / squad can access these endpoints (return 403 otherwise)
- [ ] All API tests pass (`cd services/api && yarn test`)
- [ ] Typecheck passes

---

### US-006: Update Streak Increment Logic

**Description:** As a user, I want my streak to increment anytime my buddy/squad and I start workouts within 20 minutes of each other — not only when the schedule says we should work out.

**Acceptance Criteria:**
- [ ] A streak day is counted if both partners (buddy) or all members (squad) started a workout within 20 minutes of each other on that calendar day, regardless of schedule
- [ ] The existing group workout detection (20-min window) already captures these events; streak calculation should use group workouts as the source of truth
- [ ] Existing streak calculation tests updated to reflect new logic
- [ ] New test cases: streak increments on unscheduled workout days, streak increments when workouts overlap within 20 min but outside schedule
- [ ] All API tests pass (`cd services/api && yarn test`)
- [ ] Typecheck passes

---

### US-007: Update Streak Reset Logic

**Description:** As a user, I want my streak to reset only after a full week (7 days) of not working out together, so occasional missed days don't break momentum.

**Acceptance Criteria:**
- [ ] A streak resets to 0 only if 7 or more consecutive calendar days pass without a group workout
- [ ] Gaps of 1–6 days do NOT reset the streak (the streak "pauses" but is not lost)
- [ ] Both Burn Buddy and Burn Squad streaks follow this rule
- [ ] New test cases: streak survives a 6-day gap, streak resets on a 7-day gap, streak survives multiple short gaps
- [ ] Existing streak tests updated for new reset window
- [ ] All API tests pass (`cd services/api && yarn test`)
- [ ] Typecheck passes

---

### US-008: Burn Buddies & Squads Card Enhancements

**Description:** As a user, I want the buddy/squad listing cards to show the next planned workout and display streaks with a fire emoji so the cards are more engaging and informative.

**Acceptance Criteria:**
- [ ] Each card on the Burn Buddies and Burn Squads list pages shows the streak as "🔥{streak}" (e.g., "🔥12")
- [ ] If a next planned workout exists (from the workout schedule), show the next occurrence (e.g., "Next: Mon 7:00 AM")
- [ ] If no upcoming planned workout exists, the field is hidden entirely (no placeholder text)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Merge username editing from `/settings` into `/account`; remove `/settings` page
- FR-2: Add `GET /users/:uid/profile` endpoint returning profile stats and buddy relationship status
- FR-3: Restrict profile endpoint access to authenticated friends only (403 for non-friends)
- FR-4: Add `/profile/[uid]` page with stats display and conditional "Request to be Burn Buddy" button
- FR-5: Add `GET /burn-buddies/:id/stats` and `GET /burn-squads/:id/stats` endpoints returning highest streak ever (with date), first group workout date, and workout counts (all time + this month)
- FR-6: Display group stats on `/burn-buddies/[id]` and `/burn-squads/[id]` detail pages
- FR-7: Update streak calculation: a streak day counts whenever all members have overlapping workouts (within 20-min window), regardless of schedule
- FR-8: Update streak reset: streak resets only after 7 consecutive days without a group workout (gaps of 1–6 days pause but do not reset)
- FR-9: Apply updated streak logic to both Burn Buddies and Burn Squads
- FR-10: Display streak as "🔥{count}" on buddy/squad listing cards
- FR-11: Display next planned workout on buddy/squad listing cards (derived from WorkoutSchedule); hide if none exists
- FR-12: The "Request to be Burn Buddy" button on friend profiles must only appear when no buddy relationship or pending request exists

## Non-Goals

- No public/unauthenticated profile pages — profiles are only visible to friends
- No editing of another user's profile
- No lifetime streak history or streak graphs — just current and highest
- No push notification changes in this iteration
- No changes to the workout scheduling UI itself
- No changes to how group workouts are detected (20-min window stays the same)
- No mobile app (Expo) changes in this iteration

## Design Considerations

- Friend profile page should reuse the same stat display components planned for buddy/squad detail pages to maintain visual consistency
- "🔥" emoji should be rendered inline as text, not as an image, to keep it lightweight
- Stats sections on detail pages can use a simple grid/card layout (e.g., 2-column grid of stat tiles)
- "Request to be Burn Buddy" button should be a prominent CTA (e.g., primary color, top-right of profile header)

## Technical Considerations

- **Streak calculator refactor**: The current `streak-calculator.ts` walks backwards through individual workouts by calendar day. The new logic needs to walk through **group workouts** and allow gaps of up to 6 days. Consider refactoring to use `GroupWorkout` documents as the data source.
- **Highest streak tracking**: Currently not persisted — only current streaks are calculated on the fly. To show "highest streak ever + date," either: (a) calculate on the fly by walking full group workout history, or (b) persist highest streak as a field on the BurnBuddy/BurnSquad document and update on each calculation. Option (a) is simpler for now; (b) is a future optimization.
- **Profile stats aggregation**: The profile endpoint needs to query across all of a user's buddy/squad relationships to find the highest active streak and highest streak ever. This may involve multiple Firestore reads — consider batching.
- **Firestore access**: Always use `getDb()` from `lib/firestore.ts` — never call `admin.firestore()` directly in route handlers.
- **Shared types**: New types (e.g., `ProfileStats`, `GroupStats`) should be added to `packages/shared/src/types.ts`.

## Success Metrics

- Users can view a friend's profile and key stats in ≤2 taps from the Friends page
- Buddy/squad detail pages show 5 stat tiles (active streak, highest streak, first workout, workouts all time, workouts this month)
- Streaks no longer reset on a single missed day — only after 7 consecutive days of inactivity
- Settings page fully merged into Account — no dangling routes

## Resolved Questions

- **Should "highest streak ever" include historical data?** Yes — include all historical data. Since streaks are calculated on the fly from existing group workout documents, historical data is available at no extra cost.
- **Should the profile page show stats per buddy/squad or aggregated?** Aggregated only — show the single highest active streak and single highest streak ever across all of the user's buddy/squad relationships (with the buddy/squad name for context, e.g., "🔥12 with @alex").
- **For squad streaks, does "all members" mean literally all?** Yes — strict mode. All squad members must participate (start workouts within 20 min) for a streak day to count. This matches the current group workout detection logic.
