# PRD: Fix Supernova Streak Reset Logic

## Introduction

The supernova streak currently uses the same 7-day gap tolerance as the burn streak, which means a burn buddy pair can go up to 6 days without working out and still show a supernova streak of 1. Users expect the supernova streak to be stricter — resetting to 0 if no group workout occurred today or yesterday. This fix differentiates the two streak types: burn streak remains lenient (7-day tolerance), supernova streak becomes strict (1-day grace period).

## Goals

- Supernova streak resets to 0 when neither today nor yesterday has a group workout
- Burn streak retains the existing 7-day gap tolerance (no behavior change)
- Both streaks display 0 (not 1) when their respective grace periods are exceeded
- Fix applies to both burn buddy and burn squad streak endpoints

## User Stories

### US-001: Separate supernova streak calculation from burn streak

**Description:** As a user, I want the supernova streak to reflect a strict daily workout cadence so that it only counts when my buddy and I are consistently working out together.

**Acceptance Criteria:**
- [ ] `calculateStreaks()` returns different values for `burnStreak` and `supernovaStreak`
- [ ] `supernovaStreak` uses a max gap of 1 day (resets when 2+ consecutive days have no group workout)
- [ ] `burnStreak` continues to use a max gap of 6 days (resets when 7+ consecutive days have no group workout — unchanged from current behavior)
- [ ] When the most recent group workout was 2+ days ago, `supernovaStreak` is 0
- [ ] When the most recent group workout was 7+ days ago, `burnStreak` is 0
- [ ] Typecheck passes (`cd services/api && npx tsc --noEmit`)

### US-002: Update streak tests for differentiated behavior

**Description:** As a developer, I need tests that verify the supernova streak resets independently from the burn streak so we don't regress.

**Acceptance Criteria:**
- [ ] Test: workout only today → burnStreak=1, supernovaStreak=1
- [ ] Test: workout only yesterday → burnStreak=1, supernovaStreak=1
- [ ] Test: last workout 2 days ago → burnStreak=1, supernovaStreak=0
- [ ] Test: last workout 6 days ago → burnStreak=1, supernovaStreak=0
- [ ] Test: last workout 7 days ago → burnStreak=0, supernovaStreak=0
- [ ] Test: workouts today and 3 days ago (2-day gap) → burnStreak=2, supernovaStreak=1
- [ ] Test: workouts today and 2 days ago (1-day gap) → burnStreak=2, supernovaStreak=2
- [ ] Test: no workouts → burnStreak=0, supernovaStreak=0
- [ ] All existing tests updated to reflect new separate values where applicable
- [ ] All tests pass (`cd services/api && yarn test`)

### US-003: Verify burn squad streaks use the same fix

**Description:** As a burn squad member, I want supernova streak to behave the same way for squads as it does for buddies.

**Acceptance Criteria:**
- [ ] `GET /burn-squads/:id/streaks` returns differentiated `burnStreak` and `supernovaStreak` (no code change needed if both endpoints call the same `calculateStreaks()` — just verify)
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Parameterize the gap tolerance in the streak walking algorithm. Burn streak max gap = 6 days. Supernova streak max gap = 1 day.
- FR-2: `calculateStreaks()` must compute `burnStreak` and `supernovaStreak` with their respective gap tolerances and return them as separate values.
- FR-3: A streak of 0 is returned when the grace period is exceeded — never a minimum of 1.
- FR-4: The `last7Days` array is unaffected (it describes factual workout history, not streak logic).
- FR-5: `calculateHighestStreakEver()` continues to use the burn streak (7-day tolerance) for the all-time high — no change needed.
- FR-6: No changes to the `StreakDetail` type in `@burnbuddy/shared` (the interface already has both fields).

## Non-Goals

- No UI changes — the web and mobile apps already display whatever the API returns
- No changes to `calculateHighestStreakEver()` or `calculateGroupStats()`
- No changes to how `last7Days` is computed
- No new API endpoints or response shape changes
- No mobile app changes

## Dependencies

None

## Technical Considerations

- The core fix is in `services/api/src/services/streak-calculator.ts` — extract the backward-walking loop into a helper that accepts a `maxGap` parameter, then call it twice: once with `maxGap=6` (burn) and once with `maxGap=1` (supernova).
- Both `burn-buddies/:id/streaks` and `burn-squads/:id/streaks` call `calculateStreaks()`, so fixing the function fixes both endpoints automatically.
- All date handling uses UTC via `toISOString().substring(0, 10)` — no timezone changes needed.
- Test file is `services/api/src/services/streak-calculator.test.ts` — update existing tests and add new differentiation tests.

## Success Metrics

- Supernova streak displays 0 when last group workout was 2+ days ago
- Burn streak is unchanged from current behavior
- All existing and new tests pass

## Open Questions

None — scope is well-defined.
