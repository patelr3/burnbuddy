# PRD: Streak Dots Tile Layout

## Introduction

The StreakDots components (Burn Streak and Supernova Streak) currently render as unstyled floating elements above the stat card grid. This makes them look visually disparate from the surrounding gray-bordered stat tiles. This PRD wraps each streak in its own card tile — matching the existing StatCard appearance — and integrates them into the same 2-column grid as the other stats.

## Goals

- Give each streak (Burn Streak, Supernova Streak) its own card tile with the same styling as StatCard
- Integrate streak tiles into the existing 2-column stat grid (single column per streak)
- Adapt the StreakDots layout to fit within a single-column tile width (stack count above dots)
- Apply consistently across web (3 pages) and mobile (2 screens)

## User Stories

### US-001: Restyle web StreakDots as a card tile component
**Description:** As a user, I want the streak dots to be displayed inside a styled card tile so they match the surrounding stat tiles visually.

**Acceptance Criteria:**
- [ ] StreakDots component renders inside a container with the same styling as StatCard: `rounded-lg border border-gray-700 bg-surface px-4 py-3.5`
- [ ] Layout adapts for single-column width: streak label + count on top row, 7 dots on second row
- [ ] Both `orange` (Burn Streak) and `violet` (Supernova Streak) variants render correctly
- [ ] Danger state (red) still displays correctly within the tile
- [ ] Typecheck passes (`cd apps/web && yarn typecheck`)

### US-002: Integrate web streak tiles into stat grid
**Description:** As a user, I want the streak tiles to be part of the same grid as the other stat tiles so the layout looks cohesive.

**Acceptance Criteria:**
- [ ] On burn buddy detail page (`burn-buddies/[id]/page.tsx`): both streak tiles are inside the `grid grid-cols-2 gap-3` grid alongside other StatCards. Remove the separate `mb-5 flex flex-col gap-2` wrapper
- [ ] On burn squad detail page (`burn-squads/[id]/page.tsx`): same integration into the stat grid
- [ ] On friend profile page (`profile/[uid]/page.tsx`): same integration into the stat grid
- [ ] Streak tiles occupy one grid cell each (single column, not spanning 2 columns)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Restyle mobile StreakDots as a card tile
**Description:** As a mobile user, I want the streak dots displayed inside a styled card tile matching the mobile stat cards.

**Acceptance Criteria:**
- [ ] StreakDots component renders inside a container matching mobile statCard style: `backgroundColor: '#fafafa'`, `borderRadius: 10`, `padding: 14`, `borderWidth: 1`, `borderColor: '#f1f5f9'`
- [ ] Layout adapts for single-column tile: label + count on top, 7 dots on bottom row
- [ ] Both orange and violet variants render correctly
- [ ] Danger state (red) still works within the tile

### US-004: Integrate mobile streak tiles into stat grid
**Description:** As a mobile user, I want the streak tiles to be part of the same grid as the other stat tiles.

**Acceptance Criteria:**
- [ ] On BurnBuddyDetailScreen: both streak tiles are inside the `statsGrid` alongside other statCards. Remove the separate `streakDotsSection` wrapper
- [ ] On BurnSquadDetailScreen: same integration into the statsGrid
- [ ] Streak tiles use `width: '47%'` like other stat cards to fit the 2-column layout
- [ ] Mobile typecheck passes (`cd apps/mobile && npx tsc --noEmit`)

## Functional Requirements

- FR-1: Each StreakDots component must be wrapped in a card/tile container that visually matches StatCard
- FR-2: The internal layout of StreakDots must stack vertically (label + count on first row, dots on second row) to fit within a single grid column
- FR-3: Day-of-week labels below each dot must be removed to fit the narrower single-column tile width. Just show the 7 dots in a row
- FR-4: Streak tiles must be the first two cells in the stat grid (top row), before other stat tiles
- FR-5: The card styling must be applied within the StreakDots component itself (not as a wrapper in each page) to keep the pages DRY
- FR-6: When streak data is unavailable (empty `last7Days`), show the tile with 0 count and all ○ dots — never hide the tiles

## Non-Goals

- No changes to streak calculation logic or data
- No changes to the StatCard component itself
- No changes to the API or shared types
- No new pages or routes
- No changes to the dashboard page (only affects detail/profile pages)

## Dependencies

None

## Design Considerations

- **Web StatCard styling:** `rounded-lg border border-gray-700 bg-surface px-4 py-3.5`
- **Mobile statCard styling:** `backgroundColor: '#fafafa'`, `borderRadius: 10`, `padding: 14`, `borderWidth: 1`, `borderColor: '#f1f5f9'`
- The StreakDots component currently uses a horizontal layout (label + dots side-by-side). To fit in a single grid column, switch to a stacked layout: first row is `🔥 {count} {label}`, second row is the 7 dots with day labels
- The dots currently use `gap-1.5` (6px) on web and `gap: 6` on mobile — may need slight reduction to fit in ~50% width

## Technical Considerations

- The card styling should be baked into StreakDots itself (FR-5) so all 5 usage sites get it automatically without per-page wrapper divs
- Web pages affected: `apps/web/src/app/(main)/burn-buddies/[id]/page.tsx`, `apps/web/src/app/(main)/burn-squads/[id]/page.tsx`, `apps/web/src/app/(main)/profile/[uid]/page.tsx`
- Mobile screens affected: `apps/mobile/src/screens/BurnBuddyDetailScreen.tsx`, `apps/mobile/src/screens/BurnSquadDetailScreen.tsx`

## Success Metrics

- Streak tiles are visually indistinguishable from stat tiles in terms of card styling (border, background, border-radius)
- All 5 usage sites display a cohesive grid of tiles with no visually floating/unstyled elements

## Open Questions

All resolved — see Design Decisions below.

## Design Decisions

1. **Grid position:** Streak tiles appear as the first two cells in the grid (top row, before other stat tiles).
2. **Empty state:** When streak data is unavailable, show the tile with 0 count and all ○ dots (never hide the tiles).
3. **Day labels removed:** To fit within a single grid column (~160px), drop the day-of-week labels (S, M, T, W, T, F, S) below each dot. Just show the 7 dots in a row.
