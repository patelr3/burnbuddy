# PRD: Streak Ring UI

## Introduction

Replace the current plain-number streak displays with a 7-segment ring visualization. Each ring is split into 7 segments representing the last 7 days, with filled segments for days that had a group workout and empty segments for days without. The center of the ring displays the current streak count. This applies to both burn streak and supernova streak rings on the burn buddy detail, burn squad detail, and friend profile pages. The dashboard home page cards retain the existing `🔥{number}` badge.

## Goals

- Provide an at-a-glance visual of recent workout consistency over the last 7 days
- Replace the existing "Burn Streak" and "Supernova Streak" stat cards on detail pages with ring visualizations
- Add burn streak and supernova streak rings to the friend profile page
- Maintain existing color conventions (orange/amber for burn streak, violet/purple for supernova streak)
- Extend the API to return per-day workout history needed for the ring segments
- Educate users on how each streak type works via hover/tap explanation popups

## User Stories

### US-001: Extend streak calculator to return last-7-days breakdown
**Description:** As a developer, I need the streak calculation logic to return which of the last 7 days had group workouts so the UI can render ring segments.

**Acceptance Criteria:**
- [ ] `calculateStreaks()` in `services/api/src/services/streak-calculator.ts` returns a new `last7Days` field: an array of 7 objects (index 0 = 6 days ago, index 6 = today)
- [ ] Each object contains `{ date: string; hasWorkout: boolean; groupWorkoutId: string | null; dayLabel: string }` — date in ISO format (YYYY-MM-DD), whether a group workout occurred on that UTC calendar day, the group workout ID if one exists (for navigation), and a single-letter day-of-week label (e.g., "M", "T", "W")
- [ ] Existing `burnStreak` and `supernovaStreak` values remain unchanged
- [ ] Existing unit tests still pass
- [ ] New unit tests cover `last7Days` for various scenarios: all 7 active, none active, alternating, streak with gaps
- [ ] Typecheck passes

### US-002: Add shared type for streak response with day breakdown
**Description:** As a developer, I need a shared type that includes per-day workout data so both API and web can reference it.

**Acceptance Criteria:**
- [ ] Add `StreakDayInfo` and `StreakDetail` types to `packages/shared/src/types.ts`:
  ```typescript
  interface StreakDayInfo {
    date: string;           // ISO date string (YYYY-MM-DD)
    hasWorkout: boolean;
    groupWorkoutId: string | null;
    dayLabel: string;       // Single-letter day label: "M", "T", "W", "T", "F", "S", "S"
  }

  interface StreakDetail {
    burnStreak: number;
    supernovaStreak: number;
    last7Days: StreakDayInfo[]; // length 7, index 0 = 6 days ago, index 6 = today
  }
  ```
- [ ] Update `GroupStats` type to include `last7Days: StreakDayInfo[]`
- [ ] Update `ProfileStats` to include `highestActiveStreakLast7Days: StreakDayInfo[] | null` (the last-7-days array for the relationship with the highest active streak)
- [ ] Shared package builds successfully (`cd packages/shared && yarn build`)
- [ ] Typecheck passes

### US-003: Update API streak endpoints to return last-7-days data
**Description:** As a developer, I need all streak-related API endpoints to include the `last7Days` array in their responses.

**Acceptance Criteria:**
- [ ] `GET /burn-buddies/:id/streaks` returns `{ burnStreak, supernovaStreak, last7Days }` (matching `StreakDetail`, where `last7Days` is `StreakDayInfo[]`)
- [ ] `GET /burn-squads/:id/streaks` returns `{ burnStreak, supernovaStreak, last7Days }` (matching `StreakDetail`, where `last7Days` is `StreakDayInfo[]`)
- [ ] `GET /users/:uid/profile` response includes `highestActiveStreakLast7Days` in `ProfileStats`
- [ ] Dashboard endpoint enriches each buddy/squad with `last7Days` alongside existing streak fields
- [ ] Existing API tests still pass
- [ ] New/updated tests verify `last7Days` is present and correct in responses
- [ ] Typecheck passes

### US-004: Create StreakRing reusable component
**Description:** As a user, I want to see my streak visualized as a ring so I can quickly understand my recent workout consistency.

**Acceptance Criteria:**
- [ ] New component at `apps/web/src/components/StreakRing.tsx`
- [ ] Renders an SVG ring split into 7 equal segments with small gaps between them
- [ ] Each segment is filled (solid color) if the day had a group workout, dimmed/empty if not
- [ ] Each segment displays a single-letter day-of-week label (e.g., "M", "T", "W") inside the segment arc
- [ ] Filled segments with a `groupWorkoutId` are clickable — clicking navigates to the group workout detail page (e.g., `/burn-buddies/{id}/group-workouts/{gwId}`)
- [ ] Clickable segments show a pointer cursor on hover
- [ ] Center of the ring displays the streak count as a large number
- [ ] Label below the ring reads "Burn Streak" or "Supernova Streak"
- [ ] Accepts props: `streakCount: number`, `last7Days: StreakDayInfo[]`, `color: 'orange' | 'violet'`, `label: string`, `description: string`
- [ ] Orange variant uses the existing `--color-primary` / amber theme colors
- [ ] Violet variant uses the existing violet/purple theme colors
- [ ] Ring is responsive and looks good at different sizes (minimum ~100px diameter)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Replace streak stat cards with rings on burn buddy detail page
**Description:** As a user viewing a burn buddy's detail page, I want to see streak rings instead of plain number cards for a more engaging visual experience.

**Acceptance Criteria:**
- [ ] On `apps/web/src/app/(main)/burn-buddies/[id]/page.tsx`, the "Burn Streak" and "Supernova Streak" stat cards are replaced with `StreakRing` components
- [ ] Burn Streak ring uses orange/amber color, Supernova Streak ring uses violet color
- [ ] Rings are displayed side-by-side above or integrated into the remaining stats grid
- [ ] Ring segments accurately reflect the last 7 days of group workout activity for this buddy
- [ ] Remaining 6 stat cards (Highest Streak, First Workout, Total Workouts, This Month, This Week, Burn Buddy Since) are unchanged
- [ ] Page fetches `last7Days` from the streaks endpoint
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Replace streak stat cards with rings on burn squad detail page
**Description:** As a user viewing a burn squad's detail page, I want to see the same streak ring visualization.

**Acceptance Criteria:**
- [ ] On `apps/web/src/app/(main)/burn-squads/[id]/page.tsx`, the "Burn Streak" and "Supernova Streak" stat cards are replaced with `StreakRing` components
- [ ] Same visual treatment as burn buddy page (orange for burn, violet for supernova)
- [ ] Rings accurately reflect squad group workout activity for last 7 days
- [ ] Remaining stat cards unchanged
- [ ] Page fetches `last7Days` from the streaks endpoint
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Add streak explanation popups
**Description:** As a user, I want to understand how each streak type works so I can maintain my streaks effectively.

**Acceptance Criteria:**
- [ ] Hovering or tapping the "Burn Streak" label (below the ring) shows a popup/tooltip explaining: "Burn Streak — Log at least one group workout per week to keep your burn streak alive. Miss a full week (7 days) and the streak resets to zero."
- [ ] Hovering or tapping the "Supernova Streak" label shows a popup/tooltip explaining: "Supernova Streak — Log a group workout every single day to build your supernova streak. Miss a day and the supernova streak resets to zero."
- [ ] The label includes a small info icon (ⓘ or similar) to signal the popup is available
- [ ] Popup dismisses when the user moves the cursor away (desktop) or taps elsewhere (mobile)
- [ ] Popup is styled consistently with the app's dark theme (dark background, light text, subtle border)
- [ ] Popup is positioned so it doesn't overflow the viewport
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Add streak rings to friend profile page
**Description:** As a user viewing a friend's profile, I want to see their streak visualized as rings so I can see their recent consistency.

**Acceptance Criteria:**
- [ ] On `apps/web/src/app/(main)/profile/[uid]/page.tsx`, add burn streak and supernova streak `StreakRing` components
- [ ] Rings display the highest active streak count and the last-7-days data from the profile endpoint
- [ ] If the friend has no active streak, rings show 0 in center with all segments empty
- [ ] Streak explanation popups work identically to buddy/squad detail pages
- [ ] Rings are positioned prominently in the stats section
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: `calculateStreaks()` must return `last7Days: boolean[]` (7 elements, index 0 = 6 days ago through index 6 = today)
- FR-2: A `last7Days[i]` entry is `true` if at least one group workout's `startedAt` falls on that UTC calendar day
- FR-3: All streak API endpoints (`/burn-buddies/:id/streaks`, `/burn-squads/:id/streaks`) must include `last7Days` in the response
- FR-4: The dashboard endpoint must include `last7Days` for each buddy and squad
- FR-5: The user profile endpoint must include `highestActiveStreakLast7Days` corresponding to the buddy/squad with the highest active streak
- FR-6: The `StreakRing` component renders as an SVG with 7 arc segments, each separated by a small gap (~4° each)
- FR-7: Filled segments use the variant color at full opacity; empty segments use the same color at ~20% opacity or a muted gray
- FR-8: The streak count number in the center uses a bold, large font
- FR-9: On detail pages, the two rings (burn + supernova) replace the former "Burn Streak" and "Supernova Streak" stat card tiles
- FR-10: The ring component must be accessible — include an `aria-label` describing the streak (e.g., "Burn Streak: 5 days, 4 of last 7 days active")
- FR-11: The streak label below each ring must include a small info icon (ⓘ) indicating a popup is available
- FR-12: Hovering (desktop) or tapping (mobile) the label+icon shows a popup explaining the streak rules
- FR-13: Burn Streak popup text: "Log at least one group workout per week to keep your burn streak alive. Miss a full week (7 days) and the streak resets to zero."
- FR-14: Supernova Streak popup text: "Log a group workout every single day to build your supernova streak. Miss a day and the supernova streak resets to zero."
- FR-15: The popup is styled with a dark background, light text, and subtle border consistent with the app's dark theme
- FR-16: The popup auto-dismisses on mouse leave (desktop) or tap outside (mobile) and does not overflow the viewport

## Non-Goals

- No animation or transition effects on the ring (can be added later)
- No ring visualization on the dashboard home page cards (they keep the `🔥` badge)
- No changes to streak calculation logic (7-day gap tolerance rule stays the same)
- No mobile app changes (Expo/React Native) — web only
- No ring on the "Highest Streak Ever" stat card — that remains a plain number

## Dependencies

- prd-profiles-streaks-stats.md (completed — provides the existing streak calculation and stats infrastructure)

## Design Considerations

- **Ring Sizing:** Rings should be approximately 100–120px diameter on desktop, scaling down on mobile
- **Layout:** Two rings side-by-side in a flex row, centered above the remaining stats grid
- **Color Scheme:** Burn streak uses `--color-primary` (orange/amber). Supernova uses a violet from the existing theme (matches current stat card color)
- **Segments:** 7 arc segments with ~4° gaps between them, starting from the top (12 o'clock position), proceeding clockwise, earliest day first (6 days ago at ~11 o'clock, today ending near 10 o'clock)
- **Empty State:** When streak is 0 and no recent workouts, all segments are dimmed and center shows "0"
- **Reuse:** The `StreakRing` component should be self-contained in a single file with no external SVG dependencies

## Technical Considerations

- The `calculateStreaks()` function already iterates through group workouts and builds a set of workout dates — extending it to return last-7-days data is a natural addition
- SVG arcs can be computed with basic trigonometry (start/end angles for each segment)
- The shared package must be rebuilt after type changes (`cd packages/shared && yarn build`) before the API or web can use the new types
- Dashboard API already fetches group workouts for each buddy/squad — the `last7Days` data can be computed alongside existing streak calculations with no extra Firestore queries

## Success Metrics

- Streak rings render correctly on all three page types (buddy detail, squad detail, friend profile)
- Ring segments accurately reflect the last 7 days of group workout activity
- No regression in page load performance (no additional API calls needed beyond existing ones)
- Passes typecheck and existing test suites

## Open Questions

None — all questions resolved.
