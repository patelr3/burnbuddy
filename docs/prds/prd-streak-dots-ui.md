# PRD: Streak Dots UI (Replace Streak Rings)

## Introduction

The current streak visualization uses SVG ring charts with 7 segments to show weekly workout history. While informative, the rings feel heavy and don't communicate streak progress at a glance. This PRD replaces the ring UI with a simpler, more motivational **dot-based streak display**: a horizontal row of 7 icons where each position represents one day (left = oldest, right = today). Workout days show a 🔥 fire emoji; rest days show a plain circle `○`.

A "danger" state activates when no workouts have occurred in the last 6 days — all 7 dots turn red to signal the streak is at risk.

This change applies to **both the web app and the React Native mobile app**, and replaces the ring everywhere it currently appears.

## Goals

- Replace the SVG streak ring with a horizontal 7-dot streak indicator
- Make streak progress instantly readable — fire emojis = workouts, circles = rest days
- Introduce a "danger" state (all dots red) when no workouts in 6+ days to motivate users
- Keep both burn streak and supernova streak as separate rows of dots
- Implement on web (Next.js) and mobile (React Native / Expo)
- Remove the old StreakRing component entirely

## User Stories

### US-001: Create StreakDots web component
**Description:** As a developer, I need a new `StreakDots` component for the web app that renders a horizontal row of 7 icons representing the last 7 days of streak data.

**Acceptance Criteria:**
- [ ] New component at `apps/web/src/components/StreakDots.tsx`
- [ ] Accepts props: `streakCount: number`, `last7Days: StreakDayInfo[]`, `color: 'orange' | 'violet'`, `label: string`
- [ ] Renders 7 positions left-to-right: index 0 = 6 days ago, index 6 = today (matches existing `last7Days` array order)
- [ ] Workout days (`hasWorkout: true`) display a 🔥 fire emoji
- [ ] Non-workout days (`hasWorkout: false`) display a circle character `○` in muted gray (`text-muted-foreground` or equivalent)
- [ ] "Danger" state: when the most recent 6 days (indices 1–6) all have `hasWorkout: false`, render ALL 7 dots/circles in red (`text-red-500`)
- [ ] Streak count and label displayed alongside the dots (e.g., "🔥 3 Burn Streak")
- [ ] Day-of-week labels (M, T, W, etc.) shown below each dot
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)
- [ ] Verify in browser using dev-browser skill

### US-002: Replace StreakRing on Burn Buddy detail page (web)
**Description:** As a user viewing a burn buddy's detail page, I want to see the new dot-based streak display instead of the ring so I can quickly see our workout pattern for the week.

**Acceptance Criteria:**
- [ ] `apps/web/src/app/(main)/burn-buddies/[id]/page.tsx` uses `StreakDots` instead of `StreakRing`
- [ ] Both burn streak (orange) and supernova streak (violet) shown as separate rows
- [ ] Visual layout is clean — two rows stacked vertically with labels
- [ ] No references to `StreakRing` remain in this file
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Replace StreakRing on Burn Squad detail page (web)
**Description:** As a user viewing a burn squad's detail page, I want to see the new dot-based streak display.

**Acceptance Criteria:**
- [ ] `apps/web/src/app/(main)/burn-squads/[id]/page.tsx` uses `StreakDots` instead of `StreakRing`
- [ ] Both burn streak and supernova streak shown as separate dot rows
- [ ] No references to `StreakRing` remain in this file
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Replace StreakRing on Friend Profile page (web)
**Description:** As a user viewing a friend's profile, I want to see the new dot-based streak display.

**Acceptance Criteria:**
- [ ] `apps/web/src/app/(main)/profile/[uid]/page.tsx` uses `StreakDots` instead of `StreakRing`
- [ ] Streak data rendered using same `highestActiveStreakLast7Days` from profile stats
- [ ] No references to `StreakRing` remain in this file
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Delete the old StreakRing component
**Description:** As a developer, I want to remove the old `StreakRing` component so dead code doesn't remain in the codebase.

**Acceptance Criteria:**
- [ ] `apps/web/src/components/StreakRing.tsx` is deleted
- [ ] No imports of `StreakRing` remain anywhere in the web app
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)
- [ ] Full build passes (`yarn build`)

### US-006: Create StreakDots mobile component (React Native)
**Description:** As a mobile user, I want to see the same dot-based streak display in the React Native app so the experience is consistent across platforms.

**Acceptance Criteria:**
- [ ] New component at `apps/mobile/src/components/StreakDots.tsx`
- [ ] Uses React Native `Text` and `View` components (not SVG)
- [ ] Same visual logic as web: 🔥 for workout days, `○` for rest days, red danger state
- [ ] Day-of-week labels shown below each dot
- [ ] Streak count and label displayed alongside
- [ ] Handles both `'orange'` and `'violet'` color variants
- [ ] Typecheck passes (`cd apps/mobile && npx tsc --noEmit`)

### US-007: Integrate StreakDots into mobile screens
**Description:** As a mobile user, I want to see the streak dots wherever streak data is displayed in the app.

**Acceptance Criteria:**
- [ ] Identify all mobile screens that display streak information and integrate `StreakDots`
- [ ] If no screens currently display streaks, add the streak dots to the burn buddy detail screen
- [ ] Visual parity with the web version (same icons, same danger state logic)
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Each dot row displays exactly 7 positions representing the last 7 days, ordered left (oldest) to right (most recent/today)
- FR-2: A position with `hasWorkout: true` renders a 🔥 fire emoji
- FR-3: A position with `hasWorkout: false` renders a `○` circle in muted gray
- FR-4: "Danger" state activates when the 6 most recent days (indices 1–6 of the `last7Days` array) ALL have `hasWorkout: false` — all 7 positions render in red (`text-red-500` on web, equivalent on mobile)
- FR-5: Burn streak row uses orange accent color for its label; supernova streak row uses violet accent color
- FR-6: Each position shows a single-letter day-of-week label below it (e.g., M, T, W, T, F, S, S)
- FR-7: Streak count is displayed as text alongside the dots with a fire emoji prefix (e.g., "🔥 3 Burn Streak")
- FR-8: In danger state, the streak count label text also turns red (matching the dots)
- FR-9: The component is display-only — dots are not clickable or tappable (no navigation behavior)
- FR-9: The old `StreakRing` SVG component is fully removed from the web codebase after migration
- FR-10: The `StreakDayInfo` type and API endpoints (`/burn-buddies/:id/streaks`, `/burn-squads/:id/streaks`) remain unchanged — no backend changes needed
- FR-11: The mobile component uses native React Native primitives (`View`, `Text`), not web-specific elements

## Non-Goals

- No changes to the streak calculation logic or API endpoints
- No changes to the `StreakDayInfo` or `StreakDetail` types in `@burnbuddy/shared`
- No clickable/tappable navigation from dots to group workout detail pages
- No animation or transition effects on the dots
- No tooltip or info popup on individual dots (the existing streak description tooltip may be kept or simplified)

## Dependencies

None — the existing streak API and data types are reused as-is.

## Design Considerations

### Visual Layout (each streak type)

```
🔥 3 Burn Streak
○  ○  🔥  ○  🔥  🔥  ○
M  T   W   T   F   S   S
```

### Danger State (no workouts in last 6 days)

```
🔥 0 Burn Streak
🔥  ○  ○  ○  ○  ○  ○       ← all rendered in red
 M  T  W  T  F  S  S
```

### Color Scheme
- **Burn streak label:** Orange (`#FF9500` / `text-orange-500`)
- **Supernova streak label:** Violet (`#8b5cf6` / `text-violet-500`)
- **Workout dot (🔥):** Default emoji color (no tinting needed)
- **Rest dot (○) — normal:** Muted gray (`text-muted-foreground`)
- **All dots — danger state:** Red (`text-red-500`)
- **Day labels:** Muted gray, small text

### Responsive Behavior
- Dots should be evenly spaced and scale reasonably on small screens
- On very narrow screens, the dots row should not wrap — use compact spacing if needed

### Accessibility
- Include `aria-label` on the dots container describing the streak (e.g., "Burn streak: 3 days. This week: workout on Wednesday, Friday, Saturday")
- Use semantic text, not images, for the circle character

## Technical Considerations

- The `last7Days` array from the API is already ordered index 0 = oldest, index 6 = today — render left-to-right in array order
- The `basePath` prop from `StreakRing` is no longer needed since dots are not clickable
- Web component uses Tailwind utility classes; mobile component uses React Native `StyleSheet`
- The `StreakDayInfo` type already contains `dayLabel` (single-letter day name) — use it for the labels below each dot
- Danger state check: `last7Days.slice(1).every(day => !day.hasWorkout)`

## Success Metrics

- Streak progress is understandable at a glance without needing a tooltip explanation
- Danger state (all-red) creates urgency to work out
- Visual consistency between web and mobile apps
- No regression in page load performance (simpler than SVG rings)

## Open Questions

None — all resolved:

- ✅ The streak count label includes the fire emoji (e.g., "🔥 3 Burn Streak")
- ✅ In danger state, the streak count text also turns red alongside the dots
